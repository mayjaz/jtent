import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireTicketAdmin } from "@/lib/ticket-admin";

const roleSets = {
  manager: ["super_admin", "ticket_manager"],
  checkin: ["super_admin", "ticket_manager", "checkin_staff"],
  superAdmin: ["super_admin"]
};

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Ticket administration request failed";
  const status = message.includes("Authentication required") ? 401 : message.includes("Not authorized") ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

function getQrSecret() {
  const secret = process.env.TICKET_QR_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error("Ticket QR signing is not configured; set TICKET_QR_SIGNING_SECRET to at least 32 characters");
  return secret;
}

function qrToken(ticketId: string) {
  return createHmac("sha256", getQrSecret()).update(ticketId).digest("hex");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] as string);
}

type EmailTicket = {
  attendee_name: string;
  category: string;
  event_date: string;
  event_name: string;
  order_number: string;
  ticket_number: string;
  venue: string;
};

function ticketEmailHtml(ticket: EmailTicket) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;color:#20242a">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
      <tr><td style="background:#17202b;padding:24px 28px;color:#fff">
        <p style="margin:0;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#cbd5e1">ZIM Excellence · China Edition 2027</p>
        <h1 style="margin:10px 0 0;font-size:24px;line-height:1.3">Your admission ticket</h1>
      </td></tr>
      <tr><td style="padding:24px 28px 8px">
        <p style="margin:0 0 6px;color:#667085;font-size:13px">Hello ${escapeHtml(ticket.attendee_name)}, your payment has been approved.</p>
        <h2 style="margin:0;font-size:20px;line-height:1.4">${escapeHtml(ticket.event_name)}</h2>
        <p style="margin:6px 0 0;color:#475467;font-size:14px">${escapeHtml(ticket.event_date)} · ${escapeHtml(ticket.venue)}</p>
      </td></tr>
      <tr><td style="padding:16px 28px">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #eaecf0;border-bottom:1px solid #eaecf0">
          <tr><td style="padding:12px 0;color:#667085;font-size:13px">Attendee</td><td style="padding:12px 0;text-align:right;font-size:14px;font-weight:bold">${escapeHtml(ticket.attendee_name)}</td></tr>
          <tr><td style="padding:12px 0;color:#667085;font-size:13px;border-top:1px solid #f2f4f7">Ticket category</td><td style="padding:12px 0;text-align:right;font-size:14px;border-top:1px solid #f2f4f7">${escapeHtml(ticket.category)}</td></tr>
          <tr><td style="padding:12px 0;color:#667085;font-size:13px;border-top:1px solid #f2f4f7">Ticket number</td><td style="padding:12px 0;text-align:right;font-family:monospace;font-size:14px;border-top:1px solid #f2f4f7">${escapeHtml(ticket.ticket_number)}</td></tr>
          <tr><td style="padding:12px 0;color:#667085;font-size:13px;border-top:1px solid #f2f4f7">Order reference</td><td style="padding:12px 0;text-align:right;font-family:monospace;font-size:14px;border-top:1px solid #f2f4f7">${escapeHtml(ticket.order_number)}</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:8px 28px 20px">
        <img src="cid:ticket-qr" width="220" height="220" alt="Admission QR code for ticket ${escapeHtml(ticket.ticket_number)}" style="display:block;width:220px;height:220px;margin:0 auto">
        <p style="margin:12px 0 0;color:#475467;font-size:13px">Present this QR code at check-in. A copy is also attached for easy access.</p>
      </td></tr>
      <tr><td style="padding:16px 28px 22px;background:#f9fafb;color:#667085;font-size:12px;line-height:1.6">
        Keep this ticket and QR code private. Each ticket is valid for one admission.
      </td></tr>
    </table>
  </body></html>`;
}

function ticketEmailText(ticket: EmailTicket) {
  return `ZIM Excellence · China Edition 2027
YOUR ADMISSION TICKET

${ticket.event_name}
${ticket.event_date}
${ticket.venue}

Attendee: ${ticket.attendee_name}
Ticket category: ${ticket.category}
Ticket number: ${ticket.ticket_number}
Order reference: ${ticket.order_number}

Your payment has been approved. Present the QR code in this email or the attached image at check-in. Each ticket is valid for one admission. Keep your QR code private.`;
}

async function deliverTicketEmail(supabase: Awaited<ReturnType<typeof requireTicketAdmin>>["supabase"], ticketId: string) {
  let deliveryError: string | null = null;
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.TICKET_EMAIL_FROM;
    if (!apiKey || !from) throw new Error("Ticket email is not configured; set RESEND_API_KEY and TICKET_EMAIL_FROM");

    const { data: ticket, error: detailError } = await supabase.rpc("ticket_detail", { p_ticket_id: ticketId });
    if (detailError) throw new Error(detailError.message);
    if (ticket.cancelled_at) throw new Error("Cannot email a cancelled ticket");
    const qr = await QRCode.toBuffer(qrToken(ticketId), { type: "png", errorCorrectionLevel: "H", margin: 2, width: 360 });
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `ticket-${ticketId}-${randomUUID()}`
      },
      body: JSON.stringify({
        from,
        to: [ticket.email],
        subject: `Your ${ticket.category} ticket · ${ticket.event_name}`,
        html: ticketEmailHtml(ticket),
        text: ticketEmailText(ticket),
        attachments: [{
          filename: `${ticket.ticket_number}-QR.png`,
          content: qr.toString("base64"),
          content_id: "ticket-qr"
        }]
      })
    });
    if (!emailResponse.ok) throw new Error(`Email provider returned HTTP ${emailResponse.status}: ${(await emailResponse.text()).slice(0, 500)}`);
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : "Ticket email delivery failed";
  }

  const { data, error: recordError } = await supabase.rpc("ticket_email_job_complete", {
    p_ticket_id: ticketId,
    p_success: deliveryError === null,
    p_error: deliveryError
  });
  if (recordError) throw new Error(`Email delivery ${deliveryError ? "failed" : "completed"}, but its status could not be recorded: ${recordError.message}`);
  return { ...data, error: deliveryError };
}

export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get("action") ?? "dashboard";
    const access = await requireTicketAdmin(action === "checkin" ? roleSets.checkin : roleSets.manager);
    const { supabase } = access;
    let result;

    if (action === "ticket-qr" || action === "ticket-print") {
      const ticketId = request.nextUrl.searchParams.get("ticketId");
      if (!ticketId) throw new Error("Ticket ID is required");
      const { data: ticket, error } = await supabase.rpc("ticket_detail", { p_ticket_id: ticketId });
      if (error) throw new Error(error.message);
      const svg = await QRCode.toString(qrToken(ticketId), { type: "svg", errorCorrectionLevel: "H", margin: 2, width: 240 });
      if (action === "ticket-qr") return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" } });
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ticket.ticket_number)}</title><style>body{font:16px Arial,sans-serif;color:#20242a;max-width:680px;margin:48px auto;padding:24px;border:1px solid #ddd}header{border-bottom:1px solid #ddd;padding-bottom:16px}h1{font-size:24px}.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee}.qr{text-align:center;margin:28px}small{color:#667085}@media print{button{display:none}body{margin:0}}</style></head><body><header><small>ZIM EXCELLENCE · CHINA EDITION 2027</small><h1>Event admission ticket</h1></header><div class="row"><b>Ticket number</b><span>${escapeHtml(ticket.ticket_number)}</span></div><div class="row"><b>Attendee</b><span>${escapeHtml(ticket.attendee_name)}</span></div><div class="row"><b>Category</b><span>${escapeHtml(ticket.category)}</span></div><div class="row"><b>Event</b><span>${escapeHtml(ticket.event_name)}</span></div><div class="row"><b>Date</b><span>${escapeHtml(ticket.event_date)}</span></div><div class="row"><b>Venue</b><span>${escapeHtml(ticket.venue)}</span></div><div class="qr">${svg}<p><small>Present this QR code at check-in.</small></p></div><button onclick="window.print()">Print / Save as PDF</button><script>window.onload=()=>window.print()</script></body></html>`;
      return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
    }

    if (action === "dashboard") {
      const [summary, inventoryReservations] = await Promise.all([
        supabase.rpc("ticket_dashboard_data"),
        supabase.rpc("ticket_admin_inventory_reservations")
      ]);
      if (summary.error) throw new Error(summary.error.message);
      if (inventoryReservations.error) throw new Error(inventoryReservations.error.message);
      const reservedById = new Map<string, number>(
        (inventoryReservations.data ?? []).map((item: { id: string; reserved: number }) => [item.id, Number(item.reserved)])
      );
      const data = {
        ...summary.data,
        inventory: (summary.data.inventory ?? []).map((item: { id: string }) => ({
          ...item,
          reserved: reservedById.get(item.id) ?? 0
        }))
      };
      return NextResponse.json({ data });
    } else if (action === "orders") {
      result = await supabase.rpc("ticket_admin_orders", {
        p_search: request.nextUrl.searchParams.get("search") ?? "",
        p_status: request.nextUrl.searchParams.get("status") ?? "",
        p_method: request.nextUrl.searchParams.get("method") ?? "",
        p_category: request.nextUrl.searchParams.get("category") ?? ""
      });
    } else if (action === "tickets") result = await supabase.rpc("ticket_admin_list");
    else if (action === "activity") result = await supabase.rpc("ticket_admin_activity");
    else throw new Error("Unknown ticket administration view");

    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ data: result.data });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;
    const allowed = action === "checkin" ? roleSets.checkin : action === "inventory" ? roleSets.superAdmin : roleSets.manager;
    const { supabase } = await requireTicketAdmin(allowed);
    let result;

    if (action === "review") {
      if (body.approve === true) getQrSecret();
      result = await supabase.rpc("ticket_review_payment", {
        p_order_id: body.orderId,
        p_approve: body.approve === true,
        p_note: typeof body.note === "string" ? body.note.trim().slice(0, 1000) : ""
      });
      if (!result.error && body.approve === true) {
        const ticketIds = (result.data?.ticket_ids ?? []) as string[];
        for (const ticketId of ticketIds) {
          const token = qrToken(ticketId);
          const { error } = await supabase.rpc("ticket_set_qr_hash", {
            p_ticket_id: ticketId,
            p_hash: createHash("sha256").update(token).digest("hex")
          });
          if (error) throw new Error(`Payment was recorded, but QR initialization failed for a ticket. Retry approval to resume: ${error.message}`);
        }
      }
    } else if (action === "checkin") {
      result = await supabase.rpc("ticket_check_in", {
        p_token: typeof body.token === "string" ? body.token : null,
        p_ticket_number: typeof body.ticketNumber === "string" ? body.ticketNumber : null
      });
    } else if (action === "inventory") {
      result = await supabase.rpc("ticket_set_inventory", {
        p_type_id: body.id,
        p_price: body.price,
        p_allocation: body.allocation,
        p_available: body.available === true
      });
    } else if (action === "retry-email" || action === "resend-email") {
      result = await supabase.rpc("ticket_retry_email", { p_ticket_id: body.ticketId });
    } else if (action === "cancel") {
      result = await supabase.rpc("ticket_cancel_ticket", {
        p_ticket_id: body.ticketId,
        p_reason: typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : ""
      });
    } else if (action === "proof") {
      if (typeof body.path !== "string" || !body.path.startsWith("payments/")) throw new Error("Invalid payment proof path");
      const { data, error } = await supabase.storage.from("ticket-payment-proofs").createSignedUrl(body.path, 60);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data: data.signedUrl });
    } else throw new Error("Unknown ticket administration action");

    if (result.error) throw new Error(result.error.message);
    let data = result.data;
    if (action === "review" && body.approve === true && ["approved", "already_approved"].includes(result.data?.status)) {
      const emailResults = [];
      for (const ticketId of (result.data.ticket_ids ?? []) as string[]) {
        const { data: ticket, error: detailError } = await supabase.rpc("ticket_detail", { p_ticket_id: ticketId });
        if (detailError) throw new Error(detailError.message);
        if (ticket.email_status === "PENDING") emailResults.push(await deliverTicketEmail(supabase, ticketId));
      }
      data = { ...result.data, email_delivery: emailResults };
    } else if (action === "retry-email" || action === "resend-email") {
      data = { ...result.data, email_delivery: await deliverTicketEmail(supabase, body.ticketId) };
    }
    return NextResponse.json({ data });
  } catch (error) {
    return failure(error);
  }
}
