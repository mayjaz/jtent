import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const proofBucket = "ticket-payment-proofs";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Ticket request failed";
  const status = message.includes("not configured") ? 503 : 400;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function paymentQrPath(method: string) {
  const path = method === "WECHAT_PAY"
    ? process.env.TICKET_WECHAT_QR_PATH
    : method === "ALIPAY" ? process.env.TICKET_ALIPAY_QR_PATH : undefined;
  if (!path || !path.startsWith("payment-qr/")) {
    throw new Error(`${method === "WECHAT_PAY" ? "WeChat Pay" : "Alipay"} QR code is not configured`);
  }
  return path;
}

async function getPaymentQrUrl(method: string) {
  const storage = createServiceClient().storage.from(proofBucket);
  const { data, error } = await storage.createSignedUrl(paymentQrPath(method), 30 * 60);
  if (error) throw new Error(`Could not load the payment QR code: ${error.message}`);
  return data.signedUrl;
}

function identifyImage(file: File) {
  if (file.type === "image/png") return { extension: "png", bytes: [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a] };
  if (file.type === "image/jpeg") return { extension: "jpg", bytes: [0xff,0xd8,0xff] };
  if (file.type === "image/webp") return { extension: "webp", bytes: [0x52,0x49,0x46,0x46] };
  return null;
}

function hasExpectedSignature(bytes: Buffer, file: File) {
  const signature = identifyImage(file);
  if (!signature || bytes.length < signature.bytes.length) return false;
  if (!signature.bytes.every((byte, index) => bytes[index] === byte)) return false;
  return file.type !== "image/webp" || bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("action") !== "catalog") throw new Error("Unknown ticket request");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("ticket_public_catalog");
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Ticket availability is temporarily unavailable. Please try again later." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const orderNumber = String(form.get("orderNumber") ?? "");
      const accessToken = String(form.get("accessToken") ?? "");
      const transactionReference = String(form.get("transactionReference") ?? "").trim();
      const file = form.get("proof");
      if (!(file instanceof File)) throw new Error("Choose a payment screenshot");
      if (file.size <= 0 || file.size > 4 * 1024 * 1024) throw new Error("Payment screenshot must be 4 MB or smaller");
      if (!transactionReference || transactionReference.length > 120) throw new Error("Enter a valid payment transaction reference");

      const { data: order, error: authorizationError } = await supabase.rpc("ticket_authorize_order", {
        p_order_number: orderNumber,
        p_access_token: accessToken
      });
      if (authorizationError) throw new Error(authorizationError.message);
      if (order.payment_status !== "PENDING_PAYMENT" || Date.now() >= new Date(order.expires_at).getTime()) {
        throw new Error("This order is no longer accepting payment proof");
      }

      const image = identifyImage(file);
      if (!image) throw new Error("Upload a PNG, JPEG, or WebP payment screenshot");
      const fileBytes = Buffer.from(await file.arrayBuffer());
      if (!hasExpectedSignature(fileBytes, file)) throw new Error("The uploaded file does not match its image format");

      const path = `payments/${order.order_id}/${randomUUID()}.${image.extension}`;
      const storage = createServiceClient().storage.from(proofBucket);
      const { error: uploadError } = await storage.upload(path, fileBytes, { contentType: file.type, upsert: false });
      if (uploadError) throw new Error(`Could not upload payment proof: ${uploadError.message}`);

      const { data, error: submissionError } = await supabase.rpc("ticket_submit_payment", {
        p_order_number: orderNumber,
        p_access_token: accessToken,
        p_transaction_reference: transactionReference,
        p_proof_path: path
      });
      if (submissionError) {
        const { error: cleanupError } = await storage.remove([path]);
        if (cleanupError) throw new Error(`${submissionError.message}; uploaded proof cleanup failed: ${cleanupError.message}`);
        throw new Error(submissionError.message);
      }
      return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    }

    const body = await request.json();
    if (body.action === "create-order") {
      const paymentQrUrl = await getPaymentQrUrl(body.paymentMethod);
      const { data, error } = await supabase.rpc("ticket_create_order", {
        p_customer_name: body.customerName,
        p_email: body.email,
        p_phone: body.phone,
        p_general_quantity: body.generalQuantity,
        p_vip_quantity: body.vipQuantity,
        p_payment_method: body.paymentMethod,
        p_attendees: body.attendees
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("The order could not be created");
      return NextResponse.json({ data: { ...data, payment_qr_url: paymentQrUrl } }, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "resume-order") {
      const { data, error } = await supabase.rpc("ticket_authorize_order", {
        p_order_number: body.orderNumber,
        p_access_token: body.accessToken
      });
      if (error) throw new Error(error.message);
      const activePayment = data.payment_status === "PENDING_PAYMENT" && Date.now() < new Date(data.expires_at).getTime();
      const paymentQrUrl = activePayment ? await getPaymentQrUrl(data.payment_method) : null;
      return NextResponse.json({ data: { ...data, payment_qr_url: paymentQrUrl } }, { headers: { "Cache-Control": "no-store" } });
    }

    throw new Error("Unknown ticket request");
  } catch (error) {
    return failure(error);
  }
}
