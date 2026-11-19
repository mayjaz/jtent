"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, LoaderCircle, LockKeyhole, Ticket } from "lucide-react";

type TicketType = {
  id: string;
  code: "GENERAL" | "VIP";
  name: string;
  price: number;
  allocation: number;
  sold: number;
  reserved: number;
  sales_available: boolean;
};
type TicketCode = TicketType["code"];

type OrderItem = { code: string; name: string; quantity: number; unit_price: number };
type CustomerOrder = {
  order_id: string;
  order_number: string;
  access_token: string;
  customer_name: string;
  email: string;
  phone?: string;
  payment_method: "WECHAT_PAY" | "ALIPAY";
  payment_status: string;
  total_amount: number;
  created_at: string;
  expires_at: string;
  items: OrderItem[];
  payment_qr_url: string | null;
};

const orderStorageKey = "zim-excellence-ticket-checkout";
const previousOrderStorageKey = "zm-excellence-ticket-checkout";
const formatCny = (amount: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(amount);

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result = await response.json() as { data?: T; error?: string };
  if (!response.ok) throw new Error(result.error ?? "Ticket request failed");
  return result.data as T;
}

export default function TicketsPage() {
  const [inventory, setInventory] = useState<TicketType[]>([]);
  const [quantities, setQuantities] = useState({ GENERAL: 0, VIP: 0 });
  const [attendeeNames, setAttendeeNames] = useState<Record<TicketCode, string[]>>({ GENERAL: [], VIP: [] });
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"WECHAT_PAY" | "ALIPAY">("WECHAT_PAY");
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [transactionReference, setTransactionReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const total = useMemo(() => (Array.isArray(inventory) ? inventory : []).reduce((amount, type) => {
    const quantity = quantities[type.code] ?? 0;
    return amount + type.price * quantity;
  }, 0), [inventory, quantities]);

  function adjustQuantity(code: TicketCode, change: -1 | 1) {
    setQuantities((current) => ({ ...current, [code]: current[code] + change }));
    setAttendeeNames((current) => ({
      ...current,
      [code]: change > 0 ? [...current[code], ""] : current[code].slice(0, -1)
    }));
  }

  function updateAttendeeName(code: TicketCode, index: number, name: string) {
    setAttendeeNames((current) => ({
      ...current,
      [code]: current[code].map((currentName, currentIndex) => currentIndex === index ? name : currentName)
    }));
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const catalog = await apiRequest<TicketType[]>("/api/tickets?action=catalog");
        if (!Array.isArray(catalog)) throw new Error("Ticket availability data was invalid. Please try again later.");
        if (active) setInventory(catalog);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load ticket availability");
      }

      try {
        const saved = sessionStorage.getItem(orderStorageKey) ?? sessionStorage.getItem(previousOrderStorageKey);
        if (saved) {
          sessionStorage.setItem(orderStorageKey, saved);
          sessionStorage.removeItem(previousOrderStorageKey);
          const credentials = JSON.parse(saved) as { orderNumber: string; accessToken: string };
          const resumed = await apiRequest<Omit<CustomerOrder, "access_token">>("/api/tickets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resume-order", orderNumber: credentials.orderNumber, accessToken: credentials.accessToken })
          });
          if (active) setOrder({ ...resumed, access_token: credentials.accessToken });
        }
      } catch (reason) {
        sessionStorage.removeItem(orderStorageKey);
        sessionStorage.removeItem(previousOrderStorageKey);
        if (active) setError(reason instanceof Error ? reason.message : "Could not resume your order");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const created = await apiRequest<CustomerOrder>("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-order",
          customerName,
          email,
          phone,
          generalQuantity: quantities.GENERAL,
          vipQuantity: quantities.VIP,
          paymentMethod,
          attendees: [
            ...attendeeNames.GENERAL.slice(0, quantities.GENERAL).map((name) => ({ category: "GENERAL", name })),
            ...attendeeNames.VIP.slice(0, quantities.VIP).map((name) => ({ category: "VIP", name }))
          ]
        })
      });
      sessionStorage.setItem(orderStorageKey, JSON.stringify({ orderNumber: created.order_number, accessToken: created.access_token }));
      setOrder(created);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your order");
    } finally { setBusy(false); }
  }

  async function submitPaymentProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || !proof) { setError("Choose a payment screenshot first."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const formData = new FormData();
      formData.set("orderNumber", order.order_number);
      formData.set("accessToken", order.access_token);
      formData.set("transactionReference", transactionReference);
      formData.set("proof", proof);
      await apiRequest<{ payment_status: string }>("/api/tickets", { method: "POST", body: formData });
      sessionStorage.removeItem(orderStorageKey);
      sessionStorage.removeItem(previousOrderStorageKey);
      setOrder({ ...order, payment_status: "PAYMENT_SUBMITTED", access_token: "", payment_qr_url: null });
      setNotice("Payment proof submitted. Tickets are issued only after an administrator approves the payment.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not submit payment proof");
    } finally { setBusy(false); }
  }

  function startOver() {
    sessionStorage.removeItem(orderStorageKey);
    sessionStorage.removeItem(previousOrderStorageKey);
    setOrder(null); setError(""); setNotice("");
    setCustomerName(""); setEmail(""); setPhone("");
    setQuantities({ GENERAL: 0, VIP: 0 });
    setAttendeeNames({ GENERAL: [], VIP: [] });
  }

  return <main className="ticket-checkout min-h-screen bg-[#f7f8fa] px-4 py-10 text-slate-800 sm:px-6 sm:py-14">
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">23 January 2027 · BaiFuYi Hotel, Beijing</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">ZIM Excellence China Edition 2027</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">Choose your tickets, pay using WeChat Pay or Alipay.</p>
      </header>

      {(error || notice) && <div role="status" className={`mb-5 rounded-xl border p-4 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error || notice}</div>}
      {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"><LoaderCircle className="mx-auto mb-3 animate-spin" size={20} />Loading ticket availability…</div>
        : order ? <OrderPayment order={order} transactionReference={transactionReference} setTransactionReference={setTransactionReference} proof={proof} setProof={setProof} busy={busy} onSubmit={submitPaymentProof} onStartOver={startOver} />
        : <form onSubmit={createOrder} className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-5 flex items-center gap-2"><Ticket size={18} /><h2 className="font-semibold">Select tickets</h2></div>
              <div className="divide-y divide-slate-100">
                {inventory.map((type) => {
                  const remaining = Math.max(0, type.allocation - type.sold - type.reserved);
                  const available = type.sales_available && remaining > 0;
                  const selectedCount = quantities.GENERAL + quantities.VIP;
                  return <div key={type.code} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div><p className="font-medium">{type.name}</p><p className="mt-1 text-sm text-slate-500">{formatCny(Number(type.price))} per ticket · {available ? "Available" : "Currently unavailable"}</p></div>
                    <div className="flex items-center gap-3"><button type="button" disabled={!available || quantities[type.code] === 0} onClick={() => adjustQuantity(type.code, -1)} aria-label={`Remove one ${type.name}`} className="h-9 w-9 rounded-lg border border-slate-200 disabled:opacity-40">−</button><span className="w-5 text-center text-sm font-medium">{quantities[type.code]}</span><button type="button" disabled={!available || selectedCount >= 10 || quantities[type.code] >= Math.min(10, remaining)} onClick={() => adjustQuantity(type.code, 1)} aria-label={`Add one ${type.name}`} className="h-9 w-9 rounded-lg border border-slate-200 disabled:opacity-40">+</button></div>
                  </div>;
                })}
                {!inventory.length && <p className="py-6 text-sm text-slate-500">Ticket types are not configured yet.</p>}
              </div>
            </section>

            {quantities.GENERAL + quantities.VIP > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-semibold">Attendee names</h2>
              <p className="mt-1 text-sm text-slate-500">Each ticket will be issued individually to the attendee named here.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {(["GENERAL", "VIP"] as const).flatMap((code) => attendeeNames[code].map((name, index) => {
                  if (index >= quantities[code]) return null;
                  const ticketName = inventory.find((ticket) => ticket.code === code)?.name ?? code;
                  return <label key={`${code}-${index}`} className="text-sm font-medium">{ticketName} · attendee {index + 1}<input required maxLength={120} value={name} onChange={(event) => updateAttendeeName(code, index, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" /></label>;
                }))}
              </div>
            </section>}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-semibold">Contact details</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium sm:col-span-2">Attendee / purchaser name<input required maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" /></label>
                <label className="text-sm font-medium">Email for ticket delivery<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" /></label>
                <label className="text-sm font-medium">Phone number<input required type="tel" maxLength={25} value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" /></label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="font-semibold">Payment method</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {([["WECHAT_PAY", "WeChat Pay"], ["ALIPAY", "Alipay"]] as const).map(([code, label]) => <label key={code} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${paymentMethod === code ? "border-slate-800 bg-slate-50" : "border-slate-200"}`}><input type="radio" name="paymentMethod" value={code} checked={paymentMethod === code} onChange={() => setPaymentMethod(code)} /><span className="text-sm font-medium">{label}</span></label>)}
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <h2 className="font-semibold">Order summary</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-600">{inventory.filter((type) => quantities[type.code] > 0).map((type) => <div key={type.code} className="flex justify-between"><span>{type.name} × {quantities[type.code]}</span><span>{formatCny(Number(type.price) * quantities[type.code])}</span></div>)}</div>
            <div className="mt-4 flex justify-between border-t border-slate-100 pt-4 font-semibold"><span>Total</span><span>{formatCny(total)}</span></div>
            <p className="mt-3 text-xs leading-5 text-slate-500"></p>
            <button type="submit" disabled={busy || total <= 0} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Creating order…" : "Continue to payment"}</button>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400"><LockKeyhole size={13} />Secure payment proof upload</div>
          </aside>
        </form>}
    </div>
  </main>;
}

function OrderPayment({ order, transactionReference, setTransactionReference, proof, setProof, busy, onSubmit, onStartOver }: {
  order: CustomerOrder; transactionReference: string; setTransactionReference: (value: string) => void; proof: File | null; setProof: (file: File | null) => void; busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onStartOver: () => void;
}) {
  const submitted = order.payment_status !== "PENDING_PAYMENT";
  const expired = Date.now() >= new Date(order.expires_at).getTime();
  return <div className="mx-auto max-w-3xl space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-slate-500">Order reference</p><h2 className="mt-1 font-mono text-xl font-semibold">{order.order_number}</h2></div><p className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{submitted ? "Payment submitted for review" : "Awaiting payment"}</p></div>
      <div className="mt-5 flex justify-between border-t border-slate-100 pt-4 text-sm"><span>Total due</span><strong>{formatCny(Number(order.total_amount))}</strong></div>
      <div className="mt-3 space-y-1 text-sm text-slate-600">{order.items.map((item) => <p key={item.code}>{item.name} × {item.quantity} · {formatCny(Number(item.unit_price) * item.quantity)}</p>)}</div>
      <p className="mt-3 text-sm text-slate-500">Payment method: {order.payment_method === "WECHAT_PAY" ? "WeChat Pay" : "Alipay"}</p>
    </section>

    {submitted ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 sm:p-7"><CheckCircle2 className="text-emerald-700" size={24} /><h2 className="mt-3 font-semibold text-emerald-950">Payment proof received</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Your payment is awaiting manual verification. If approved, individual tickets will be sent to <strong>{order.email}</strong>.</p></section>
      : expired ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This order has expired. Start a new order to check current ticket availability.</section>
        : <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-6"><h2 className="font-semibold">Pay using the QR code</h2><p className="mt-2 text-sm text-slate-500">Pay the exact order total, then upload your payment screenshot.</p>{order.payment_qr_url ? <img src={order.payment_qr_url} alt={`${order.payment_method === "WECHAT_PAY" ? "WeChat Pay" : "Alipay"} payment QR code`} className="mx-auto mt-4 aspect-square w-56 rounded-lg border border-slate-100 object-contain p-2" /> : <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Payment QR code is not available. Contact the event organizer.</p>}<p className="mt-3 flex items-center justify-center gap-1 text-xs text-slate-500"><Clock3 size={13} />Order expires {new Date(order.expires_at).toLocaleTimeString()}</p></section>
          <form onSubmit={onSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="font-semibold">Submit payment proof</h2><label className="mt-4 block text-sm font-medium">Transaction reference<input required maxLength={120} value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" /></label><label className="mt-4 block text-sm font-medium">Payment screenshot<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setProof(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full rounded-lg border border-slate-300 p-2 text-xs font-normal" /><span className="mt-1 block text-xs text-slate-500">PNG, JPEG or WebP · maximum 4 MB</span></label><button disabled={busy || !order.payment_qr_url} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">{busy ? "Uploading proof…" : "Submit for verification"}</button><p className="mt-3 text-xs leading-5 text-slate-500">Do not upload proof until your payment is complete. Ticket issuance happens only after approval.</p></form>
        </div>}
    <p className="text-center text-xs text-slate-500">Questions? Contact the event organizer and include order reference {order.order_number}.</p>
    <button onClick={onStartOver} className="mx-auto block text-sm text-slate-500 underline">Start a new order</button>
  </div>;
}
