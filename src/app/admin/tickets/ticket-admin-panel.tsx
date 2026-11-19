"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Activity, ArrowDownToLine, ArrowLeft, BarChart3, Camera, Check, CheckCircle2,
  ChevronDown, CircleDollarSign, ClipboardList, CreditCard, ExternalLink, LayoutDashboard,
  LockKeyhole, Package, RefreshCw, Search, ShieldCheck, Ticket, Users, X
} from "lucide-react";

type Section = "Overview" | "Orders" | "Tickets" | "Check-in" | "Inventory" | "Payment Settings" | "Reports" | "Activity Log";
type JsonRecord = Record<string, any>;
type ResponseData<T> = { data: T; error?: string };

const navigation: { name: Section | "Back to Main Admin"; icon: typeof LayoutDashboard; managerOnly?: boolean }[] = [
  { name: "Overview", icon: LayoutDashboard, managerOnly: true },
  { name: "Orders", icon: ClipboardList, managerOnly: true },
  { name: "Tickets", icon: Ticket, managerOnly: true },
  { name: "Check-in", icon: CheckCircle2 },
  { name: "Inventory", icon: Package, managerOnly: true },
  { name: "Payment Settings", icon: CreditCard, managerOnly: true },
  { name: "Reports", icon: BarChart3, managerOnly: true },
  { name: "Activity Log", icon: Activity, managerOnly: true },
  { name: "Back to Main Admin", icon: ArrowLeft }
];

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const statusClass: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700",
  PAYMENT_SUBMITTED: "bg-amber-50 text-amber-800",
  UNDER_REVIEW: "bg-amber-50 text-amber-800",
  REJECTED: "bg-rose-50 text-rose-700",
  REFUNDED: "bg-slate-100 text-slate-600",
  CANCELLED: "bg-slate-100 text-slate-600",
  PENDING_PAYMENT: "bg-slate-100 text-slate-600",
  VALID: "bg-emerald-100 text-emerald-800",
  "ALREADY CHECKED IN": "bg-amber-100 text-amber-800"
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const body = await response.json() as ResponseData<T>;
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body.data;
}

function Badge({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass[value] ?? "bg-slate-100 text-slate-600"}`}>{value.replaceAll("_", " ")}</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-sm text-slate-500">{children}</div>;
}

function Stat({ label, value, note, icon: Icon }: { label: string; value: string | number; note?: string; icon: typeof Users }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between"><span className="text-sm text-slate-500">{label}</span><Icon size={18} className="text-slate-400" /></div>
    <div className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
  </div>;
}

export function TicketAdminPanel({ role }: { role: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>(role === "checkin_staff" ? "Check-in" : "Overview");
  const [dashboard, setDashboard] = useState<JsonRecord | null>(null);
  const [orders, setOrders] = useState<JsonRecord[]>([]);
  const [tickets, setTickets] = useState<JsonRecord[]>([]);
  const [activity, setActivity] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [orderSort, setOrderSort] = useState("date_desc");
  const [selectedOrder, setSelectedOrder] = useState<JsonRecord | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [checkinCode, setCheckinCode] = useState("");
  const [checkinResult, setCheckinResult] = useState<JsonRecord | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const manager = role === "super_admin" || role === "ticket_manager";
  const reloadDashboard = useCallback(async () => {
    const data = await request<JsonRecord>("/api/admin/tickets?action=dashboard");
    setDashboard(data);
  }, []);

  useEffect(() => {
    if (!role) { setLoading(false); return; }
    if (section === "Check-in" && !manager) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        if (section === "Orders") {
          const params = new URLSearchParams({ action: "orders", search, status: statusFilter, method: methodFilter, category: categoryFilter });
          const data = await request<JsonRecord[]>(`/api/admin/tickets?${params}`);
          if (active) setOrders(data);
        } else if (section === "Tickets") {
          const data = await request<JsonRecord[]>("/api/admin/tickets?action=tickets");
          if (active) setTickets(data);
        } else if (section === "Activity Log") {
          const data = await request<JsonRecord[]>("/api/admin/tickets?action=activity");
          if (active) setActivity(data);
        } else if (section !== "Check-in") {
          await reloadDashboard();
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load ticket data");
      } finally {
        if (active) setLoading(false);
      }
    };
    const timer = section === "Orders" ? window.setTimeout(load, 250) : (void load(), 0);
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [role, section, search, statusFilter, methodFilter, categoryFilter, reloadDashboard, manager, refreshKey]);

  async function perform(action: string, values: JsonRecord) {
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await request<JsonRecord>("/api/admin/tickets", { method: "POST", body: JSON.stringify({ action, ...values }) });
      const emailResults = Array.isArray(result?.email_delivery) ? result.email_delivery : result?.email_delivery ? [result.email_delivery] : [];
      const emailFailed = emailResults.filter((item: JsonRecord) => item.status !== "SENT").length;
      setNotice(action === "review"
        ? `Payment ${values.approve ? "approved" : "rejected"}${result?.issued ? ` · ${result.issued} ticket(s) issued` : ""}${values.approve && emailResults.length ? ` · ${emailFailed ? `${emailFailed} email(s) need retry` : "ticket email sent"}` : ""}.`
        : action === "checkin" ? `Check-in result: ${result.status}.` : action === "retry-email" || action === "resend-email" ? result.email_delivery?.status === "SENT" ? "Full ticket email sent." : `Ticket email failed: ${result.email_delivery?.error ?? "please check delivery settings"}` : "Changes saved.");
      if (action === "checkin") setCheckinResult(result);
      if (action === "review") { setSelectedOrder(null); setReviewNote(""); setRefreshKey((key) => key + 1); await reloadDashboard(); }
      if (action === "cancel" || action === "retry-email" || action === "resend-email") {
        setTickets(await request<JsonRecord[]>("/api/admin/tickets?action=tickets"));
      }
      if (action === "inventory") await reloadDashboard();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Request failed");
    } finally { setSaving(false); }
  }

  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(`Could not sign out: ${signOutError.message}`);
      return;
    }
    router.replace("/admin/login");
    router.refresh();
  }

  async function viewProof(path: string) {
    setError("");
    try {
      const url = await request<string>("/api/admin/tickets", { method: "POST", body: JSON.stringify({ action: "proof", path }) });
      setProofUrl(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load payment proof"); }
  }

  function exportCsv() {
    const rows = orders.map((order) => [
      order.order_number, order.customer_name, order.email, order.phone, (order.items ?? []).map((item: JsonRecord) => `${item.name} x${item.quantity}`).join("; "),
      order.total_amount, order.payment_method, order.submission_reference ?? order.transaction_reference ?? "", order.payment_status, order.created_at
    ]);
    const csv = [["Order ID", "Customer", "Email", "Phone", "Tickets", "Amount CNY", "Payment method", "Transaction reference", "Payment status", "Order date"], ...rows]
      .map((row) => row.map((field) => `"${String(field ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.download = "ticket-orders.csv"; link.click(); URL.revokeObjectURL(link.href);
  }

  if (!role) return <main className="ticket-admin min-h-[70vh] bg-slate-50 p-8 text-slate-800">
    <div className="mx-auto mt-16 max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto text-slate-400" size={28} /><h1 className="mt-4 text-xl font-semibold">Ticket administration access required</h1><p className="mt-2 text-sm text-slate-500">Sign in with an account assigned a ticket admin role. Contact a Super Admin if you need access.</p><a href="/admin/login" className="mt-5 inline-block text-sm font-medium text-slate-800 underline">Go to admin sign in</a></div>
  </main>;

  const currentNav = navigation.find((item) => item.name === section);
  return <main className="ticket-admin min-h-[80vh] bg-[#f7f8fa] text-slate-800">
    <div className="mx-auto flex min-h-[80vh] max-w-[1600px]">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-6 lg:block">
        <div className="mb-8 px-3"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-400">ZIM Excellence</p><p className="mt-1 text-lg font-semibold text-slate-900">Ticket Admin</p><p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">{role.replace("_", " ")}</p></div>
        <nav className="space-y-1">
          {navigation.filter((item) => !item.managerOnly || manager).map(({ name, icon: Icon }) => name === "Back to Main Admin"
            ? <a key={name} href="/admin" className="mt-5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-50"><Icon size={17} />{name}</a>
            : <button key={name} onClick={() => setSection(name as Section)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${section === name ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={17} />{name}</button>)}
        </nav>
        <button onClick={signOut} className="mt-8 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">Sign out</button>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2 lg:hidden"><select aria-label="Admin section" value={section} onChange={(event) => setSection(event.target.value as Section)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm">{navigation.filter((item) => item.name !== "Back to Main Admin" && (!item.managerOnly || manager)).map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><a href="/admin" aria-label="Back to Main Admin" className="rounded-lg border border-slate-200 p-2 text-slate-600"><ArrowLeft size={16} /></a></div>
            <div><p className="text-sm font-semibold text-slate-900">{currentNav?.name ?? section}</p><p className="hidden text-xs text-slate-500 sm:block">ZIM Excellence China Edition 2027 · 23 January 2027</p></div>
          </div>
          <div className="flex items-center gap-2"><button onClick={() => setRefreshKey((key) => key + 1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"><RefreshCw size={14} />Refresh</button><button onClick={signOut} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 lg:hidden">Sign out</button></div>
        </header>
        <div className="px-4 py-6 md:px-8 md:py-8">
          {(error || notice) && <div role="status" className={`mb-5 flex items-start justify-between gap-3 rounded-lg border p-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}><span>{error || notice}</span><button aria-label="Dismiss" onClick={() => { setError(""); setNotice(""); }}><X size={16} /></button></div>}
          {loading ? <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading live ticket data…</div>
            : section === "Overview" ? <Overview data={dashboard} onNavigate={setSection} onReview={(order) => { setSelectedOrder(order); setReviewNote(""); }} />
            : section === "Orders" ? <Orders orders={orders} search={search} setSearch={setSearch} status={statusFilter} setStatus={setStatusFilter} method={methodFilter} setMethod={setMethodFilter} category={categoryFilter} setCategory={setCategoryFilter} sort={orderSort} setSort={setOrderSort} onSelect={setSelectedOrder} onExport={exportCsv} />
            : section === "Tickets" ? <Tickets tickets={tickets.filter((ticket) => `${ticket.ticket_number} ${ticket.order_number} ${ticket.attendee_name}`.toLowerCase().includes(ticketSearch.toLowerCase()))} search={ticketSearch} setSearch={setTicketSearch} onAction={perform} saving={saving} />
            : section === "Check-in" ? <CheckIn code={checkinCode} setCode={setCheckinCode} result={checkinResult} cameraError={cameraError} setCameraError={setCameraError} onCheck={(values) => perform("checkin", values)} saving={saving} />
            : section === "Inventory" ? <Inventory data={dashboard?.inventory ?? []} role={role} onSave={(values) => perform("inventory", values)} saving={saving} />
            : section === "Payment Settings" ? <PaymentSettings />
            : section === "Reports" ? <Reports data={dashboard} onExport={exportCsv} onLoadOrders={() => setSection("Orders")} />
            : <ActivityLog items={activity} />}
        </div>
      </div>
    </div>
    {selectedOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3" role="dialog" aria-modal="true" aria-label="Order details">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl md:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-wider text-slate-400">Order details</p><h2 className="mt-1 text-xl font-semibold">{selectedOrder.order_number}</h2></div><button onClick={() => setSelectedOrder(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button></div>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">{[["Customer", selectedOrder.customer_name], ["Email", selectedOrder.email], ["Phone", selectedOrder.phone], ["Order date", new Date(selectedOrder.created_at).toLocaleString()], ["Payment method", selectedOrder.payment_method.replace("_", " ")], ["Transaction reference", selectedOrder.submission_reference ?? selectedOrder.transaction_reference ?? "—"], ["Total amount", currency.format(Number(selectedOrder.total_amount))], ["Payment status", selectedOrder.payment_status]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words font-medium text-slate-800">{value}</p></div>)}</div>
        <div className="mt-5"><h3 className="text-sm font-semibold">Order items</h3><div className="mt-2 divide-y rounded-lg border border-slate-200">{(selectedOrder.items ?? []).map((item: JsonRecord, index: number) => <div key={index} className="flex justify-between p-3 text-sm"><span>{item.name} · {item.quantity} ticket(s)</span><span>{currency.format(Number(item.unit_price) * Number(item.quantity))}</span></div>)}</div></div>
        {selectedOrder.proof_path && <div className="mt-5"><p className="mb-2 text-sm font-semibold">Payment proof</p>{proofUrl ? <a href={proofUrl} target="_blank" rel="noreferrer"><img src={proofUrl} alt="Uploaded payment proof" className="max-h-72 rounded-lg border border-slate-200 object-contain" /></a> : <button onClick={() => viewProof(selectedOrder.proof_path)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><ExternalLink size={15} />Preview / download proof</button>}</div>}
        {["PAYMENT_SUBMITTED", "UNDER_REVIEW"].includes(selectedOrder.payment_status) && manager && <div className="mt-5 border-t border-slate-200 pt-5"><label className="text-sm font-medium" htmlFor="review-note">Internal verification note</label><textarea id="review-note" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-slate-400" placeholder="Optional note for the audit log" /><div className="mt-3 flex justify-end gap-2"><button disabled={saving} onClick={() => perform("review", { orderId: selectedOrder.id, approve: false, note: reviewNote })} className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50">Reject payment</button><button disabled={saving} onClick={() => perform("review", { orderId: selectedOrder.id, approve: true, note: reviewNote })} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Approve & issue tickets</button></div><p className="mt-2 text-xs text-slate-500">Approval validates payment and issues tickets atomically; duplicate approvals do not create duplicate tickets.</p></div>}
        {selectedOrder.payment_status === "APPROVED" && <div className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={17} />Payment approved · {selectedOrder.tickets_issued} ticket(s) issued</div>}
      </div>
    </div>}
    {proofUrl && <div className="fixed bottom-5 right-5 z-[60]"><button onClick={() => setProofUrl("")} className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white">Close proof preview</button></div>}
  </main>;
}

function Overview({ data, onNavigate, onReview }: { data: JsonRecord | null; onNavigate: (section: Section) => void; onReview: (order: JsonRecord) => void }) {
  if (!data) return <EmptyState>Dashboard data is not available.</EmptyState>;
  const bars = data.sales_by_day ?? [];
  const maxSales = Math.max(1, ...bars.map((item: JsonRecord) => Number(item.tickets)));
  const maxRevenue = Math.max(1, ...bars.map((item: JsonRecord) => Number(item.revenue)));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Ticket overview</h1><p className="mt-1 text-sm text-slate-500">Live event orders, payments, and attendance.</p></div><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">23 Jan 2027 · Beijing</span></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat label="Total orders" value={data.total_orders} icon={ClipboardList} />
      <Stat label="Tickets sold" value={data.total_tickets_sold} note={`${data.general_sold} General · ${data.vip_sold} VIP`} icon={Ticket} />
      <Stat label="Approved revenue" value={currency.format(Number(data.revenue))} icon={CircleDollarSign} />
      <Stat label="Pending verification" value={data.pending_verifications} note={`${data.rejected_payments} rejected payments`} icon={ShieldCheck} />
      <Stat label="Tickets issued" value={data.tickets_issued} icon={Ticket} />
      <Stat label="Checked in" value={data.checked_in} note={`${data.tickets_issued ? Math.round(data.checked_in * 100 / data.tickets_issued) : 0}% of issued tickets`} icon={CheckCircle2} />
      <Stat label="General Admission" value={data.general_sold} icon={Users} />
      <Stat label="VIP" value={data.vip_sold} icon={Users} />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex justify-between"><div><h2 className="font-semibold">Ticket sales</h2><p className="mt-1 text-xs text-slate-500">Issued tickets by order date · last 14 days with sales</p></div><BarChart3 size={18} className="text-slate-400" /></div>
        {bars.length ? <div className="mt-6 flex h-44 items-end gap-2 border-b border-slate-100 px-1">{bars.map((day: JsonRecord) => <div key={day.day} className="group flex h-full flex-1 flex-col justify-end"><div title={`${day.day}: ${day.tickets} tickets · ${currency.format(Number(day.revenue))}`} className="mx-auto w-full max-w-8 rounded-t bg-slate-800 transition-colors group-hover:bg-slate-600" style={{ height: `${Math.max(4, Number(day.tickets) / maxSales * 100)}%` }} /><span className="mt-2 truncate text-center text-[9px] text-slate-400">{String(day.day).slice(5)}</span></div>)}</div> : <EmptyState>No sales recorded yet.</EmptyState>}
        <div className="mt-4 flex justify-between text-xs text-slate-500"><span>Approved revenue</span><strong className="text-slate-800">{currency.format(Number(data.revenue))}</strong></div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-semibold">Ticket category breakdown</h2><button onClick={() => onNavigate("Inventory")} className="text-xs text-slate-500 hover:text-slate-900">Inventory</button></div>
        {(data.inventory ?? []).map((item: JsonRecord) => {
          const committed = Number(item.sold) + Number(item.reserved ?? 0);
          return <div key={item.id} className="mt-5"><div className="flex justify-between text-sm"><span>{item.name}</span><span className="font-medium">{item.sold} <span className="text-slate-400">/ {item.allocation}</span></span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${item.allocation ? Math.min(100, committed * 100 / item.allocation) : 0}%` }} /></div><p className="mt-1 text-xs text-slate-500">{item.sold} sold · {item.reserved ?? 0} reserved · {Math.max(0, item.allocation - committed)} remaining · {currency.format(Number(item.price))}</p></div>;
        })}
      </section>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Revenue by day</h2><p className="mt-1 text-xs text-slate-500">Approved payments only · RMB</p>
      {bars.some((day: JsonRecord) => Number(day.revenue) > 0) ? <div className="mt-5 flex h-36 items-end gap-2 border-b border-slate-100">{bars.map((day: JsonRecord) => <div key={day.day} className="group flex h-full flex-1 flex-col justify-end"><div title={`${day.day}: ${currency.format(Number(day.revenue))}`} className="mx-auto w-full max-w-8 rounded-t bg-emerald-700" style={{ height: `${Number(day.revenue) ? Math.max(4, Number(day.revenue) / maxRevenue * 100) : 0}%` }} /><span className="mt-2 truncate text-center text-[9px] text-slate-400">{String(day.day).slice(5)}</span></div>)}</div> : <EmptyState>No approved revenue recorded yet.</EmptyState>}
    </section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="font-semibold">Recent orders</h2><button onClick={() => onNavigate("Orders")} className="text-xs text-slate-500 hover:text-slate-900">All orders</button></div>
        {data.recent_orders?.length ? <div className="divide-y divide-slate-100">{data.recent_orders.map((order: JsonRecord) => <div key={order.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{order.customer_name} <span className="font-normal text-slate-400">· {order.order_number}</span></p><p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleDateString()} · {(order.items ?? []).map((item: JsonRecord) => `${item.name} ×${item.quantity}`).join(", ")}</p></div><div className="shrink-0 text-right"><p className="text-sm font-medium">{currency.format(Number(order.total_amount))}</p><div className="mt-1"><Badge value={order.payment_status} /></div></div></div>)}</div> : <EmptyState>No orders in the database.</EmptyState>}
      </section>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><h2 className="font-semibold">Pending approvals</h2><button onClick={() => onNavigate("Orders")} className="text-xs text-slate-500 hover:text-slate-900">Review queue</button></div>
        {data.pending_orders?.length ? <div className="divide-y divide-slate-100">{data.pending_orders.map((order: JsonRecord) => <div key={order.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{order.order_number} · {order.customer_name}</p><p className="mt-1 text-xs text-slate-500">{order.email} · {currency.format(Number(order.total_amount))}</p></div><button onClick={() => onReview(order)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50">Review</button></div>)}</div> : <EmptyState>No pending payment verifications.</EmptyState>}
      </section>
    </div>
  </div>;
}

function Orders({ orders, search, setSearch, status, setStatus, method, setMethod, category, setCategory, sort, setSort, onSelect, onExport }: {
  orders: JsonRecord[]; search: string; setSearch: (value: string) => void; status: string; setStatus: (value: string) => void;
  method: string; setMethod: (value: string) => void; category: string; setCategory: (value: string) => void;
  sort: string; setSort: (value: string) => void; onSelect: (order: JsonRecord) => void; onExport: () => void;
}) {
  const sorted = [...orders].sort((a, b) => sort === "amount_asc" ? Number(a.total_amount) - Number(b.total_amount) : sort === "amount_desc" ? Number(b.total_amount) - Number(a.total_amount) : sort === "date_asc" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  return <div><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-semibold">Orders</h1><p className="mt-1 text-sm text-slate-500">Search orders, inspect payment proof, and verify manual payments.</p></div><button onClick={onExport} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"><ArrowDownToLine size={16} />Export CSV</button></div>
    <div className="mt-5 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
      <label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order ID, name, email or phone" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400" /></label>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All payment statuses</option>{["PENDING_PAYMENT","PAYMENT_SUBMITTED","UNDER_REVIEW","APPROVED","REJECTED","REFUNDED","CANCELLED"].map((item) => <option key={item}>{item}</option>)}</select>
      <select value={method} onChange={(event) => setMethod(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All payment methods</option><option value="WECHAT_PAY">WeChat Pay</option><option value="ALIPAY">Alipay</option></select>
      <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All categories</option><option value="GENERAL">General Admission</option><option value="VIP">VIP</option></select>
      <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option><option value="amount_desc">Highest amount</option><option value="amount_asc">Lowest amount</option></select>
    </div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr>{["Order ID / date","Customer","Ticket category","Amount","Payment","Issuance",""].map((name) => <th key={name} className="px-4 py-3">{name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{sorted.map((order) => <tr key={order.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><button onClick={() => onSelect(order)} className="font-medium text-slate-900 hover:underline">{order.order_number}</button><p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString()}</p></td><td className="px-4 py-3"><p className="font-medium">{order.customer_name}</p><p className="text-xs text-slate-500">{order.email} · {order.phone}</p></td><td className="px-4 py-3">{(order.items ?? []).map((item: JsonRecord) => <p key={item.code}>{item.name} ×{item.quantity}</p>)}</td><td className="px-4 py-3 font-medium">{currency.format(Number(order.total_amount))}</td><td className="px-4 py-3"><p>{order.payment_method.replace("_", " ")}</p><div className="mt-1"><Badge value={order.payment_status} /></div></td><td className="px-4 py-3">{order.tickets_issued} issued</td><td className="px-4 py-3"><button onClick={() => onSelect(order)} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs hover:bg-white">Details</button></td></tr>)}</tbody></table>{!sorted.length && <EmptyState>No matching orders found.</EmptyState>}</div>
  </div>;
}

function Tickets({ tickets, search, setSearch, onAction, saving }: { tickets: JsonRecord[]; search: string; setSearch: (value: string) => void; onAction: (action: string, values: JsonRecord) => void; saving: boolean }) {
  const [category, setCategory] = useState("");
  const [checkin, setCheckin] = useState("");
  const rows = tickets.filter((ticket) => (!category || ticket.category_code === category)
    && (!checkin || (checkin === "checked" ? Boolean(ticket.checked_in_at) : !ticket.checked_in_at)));
  return <div><div><h1 className="text-2xl font-semibold">Tickets</h1><p className="mt-1 text-sm text-slate-500">Issued tickets, delivery status, and attendee check-in state.</p></div>
    <div className="mt-5 flex flex-wrap gap-2"><label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter ticket number, order, attendee" className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" /></label><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All ticket types</option><option value="GENERAL">General Admission</option><option value="VIP">VIP</option></select><select value={checkin} onChange={(event) => setCheckin(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="">All check-in states</option><option value="checked">Checked in</option><option value="not_checked">Not checked in</option></select></div>
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Ticket number","Order","Attendee","Category","Issued","Email delivery","Check-in","Actions"].map((name) => <th key={name} className="px-4 py-3">{name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((ticket) => <tr key={ticket.id}><td className="px-4 py-3 font-mono text-xs font-semibold">{ticket.ticket_number}</td><td className="px-4 py-3">{ticket.order_number}</td><td className="px-4 py-3">{ticket.attendee_name}</td><td className="px-4 py-3">{ticket.category}</td><td className="px-4 py-3">{new Date(ticket.issued_at).toLocaleDateString()}</td><td className="px-4 py-3"><Badge value={ticket.email_status} /></td><td className="px-4 py-3">{ticket.cancelled_at ? <Badge value="CANCELLED" /> : ticket.checked_in_at ? <Badge value="VALID" /> : <span className="text-slate-500">Not checked in</span>}</td><td className="px-4 py-3"><div className="flex gap-2"><a href={`/api/admin/tickets?action=ticket-print&ticketId=${encodeURIComponent(ticket.id)}`} target="_blank" rel="noreferrer" className="rounded border border-slate-200 px-2 py-1 text-xs">Print ticket</a>{!ticket.cancelled_at && ticket.email_status === "FAILED" && <button disabled={saving} onClick={() => onAction("retry-email", { ticketId: ticket.id })} className="rounded border border-slate-200 px-2 py-1 text-xs">Retry email</button>}{!ticket.cancelled_at && ticket.email_status === "SENT" && <button disabled={saving} onClick={() => onAction("resend-email", { ticketId: ticket.id })} className="rounded border border-slate-200 px-2 py-1 text-xs">Resend full ticket</button>}{!ticket.cancelled_at && !ticket.checked_in_at && <button onClick={() => { const reason = window.prompt("Reason for revoking this ticket"); if (reason) onAction("cancel", { ticketId: ticket.id, reason }); }} className="rounded border border-rose-200 px-2 py-1 text-xs text-rose-700">Revoke</button>}</div></td></tr>)}</tbody></table>{!rows.length && <EmptyState>No tickets have been issued.</EmptyState>}</div>
    <p className="mt-3 text-xs text-slate-500">Tickets can be printed or saved as PDFs from your browser. Email delivery requires the configured email provider.</p>
  </div>;
}

function CheckIn({ code, setCode, result, cameraError, setCameraError, onCheck, saving }: {
  code: string; setCode: (value: string) => void; result: JsonRecord | null; cameraError: string; setCameraError: (value: string) => void; onCheck: (values: JsonRecord) => void; saving: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCheckRef = useRef(onCheck);
  onCheckRef.current = onCheck;
  const [cameraOn, setCameraOn] = useState(false);
  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;
    const start = async () => {
      try {
        const Detector = (window as Window & { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (!Detector) throw new Error("QR scanning is not supported in this browser. Use manual ticket lookup.");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (videoRef.current) videoRef.current.srcObject = stream;
        const detector = new Detector({ formats: ["qr_code"] });
        timer = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) { setCameraOn(false); onCheckRef.current({ token: codes[0].rawValue }); }
          } catch (reason) { setCameraError(reason instanceof Error ? reason.message : "Camera scan failed"); }
        }, 500);
      } catch (reason) {
        setCameraError(reason instanceof Error ? reason.message : "Unable to start camera");
        setCameraOn(false);
      }
    };
    void start();
    return () => { stopped = true; if (timer) window.clearInterval(timer); stream?.getTracks().forEach((track) => track.stop()); };
  }, [cameraOn, setCameraError]);

  return <div className="mx-auto max-w-3xl"><div><h1 className="text-2xl font-semibold">Check-in</h1><p className="mt-1 text-sm text-slate-500">Scan a ticket QR code or look up a ticket number. Check-in is recorded atomically.</p></div>
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Camera scanner</h2><p className="mt-1 text-xs text-slate-500">Camera access requires HTTPS and browser support for QR detection.</p></div><button onClick={() => { setCameraError(""); setCameraOn(!cameraOn); }} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"><Camera size={16} />{cameraOn ? "Stop camera" : "Start scanner"}</button></div>{cameraOn && <video ref={videoRef} autoPlay playsInline className="mt-4 max-h-80 w-full rounded-lg bg-black object-contain" />}{cameraError && <p className="mt-3 text-sm text-rose-700">{cameraError}</p>}</section>
    <form onSubmit={(event) => { event.preventDefault(); onCheck({ ticketNumber: code }); }} className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><label htmlFor="ticket-number" className="text-sm font-semibold">Manual ticket number lookup</label><div className="mt-3 flex gap-2"><input id="ticket-number" value={code} onChange={(event) => setCode(event.target.value)} placeholder="TKT-…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono" /><button disabled={saving || !code.trim()} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Validate & check in</button></div></form>
    {result && <div className={`mt-4 rounded-xl border p-5 ${result.status === "VALID" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex items-center gap-2"><Badge value={result.status} /><span className="text-sm font-semibold">{result.ticket_number ?? "Ticket check result"}</span></div>{result.attendee_name && <p className="mt-3 text-sm">{result.attendee_name} · {result.category}</p>}{result.status === "INVALID" && <p className="mt-2 text-sm">No matching ticket was found.</p>}</div>}
  </div>;
}

function Inventory({ data, role, onSave, saving }: { data: JsonRecord[]; role: string; onSave: (values: JsonRecord) => void; saving: boolean }) {
  const superAdmin = role === "super_admin";
  return <div><h1 className="text-2xl font-semibold">Inventory</h1><p className="mt-1 text-sm text-slate-500">Ticket availability and pricing. Allocation is enforced on the server during payment approval.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{data.map((item) => <InventoryCard key={item.id} item={item} canEdit={superAdmin} onSave={onSave} saving={saving} />)}</div>{!superAdmin && <p className="mt-4 text-xs text-slate-500">Only a Super Admin can change ticket pricing or allocation.</p>}</div>;
}
function InventoryCard({ item, canEdit, onSave, saving }: { item: JsonRecord; canEdit: boolean; onSave: (values: JsonRecord) => void; saving: boolean }) {
  const [price, setPrice] = useState(String(item.price));
  const [allocation, setAllocation] = useState(String(item.allocation));
  const [available, setAvailable] = useState(Boolean(item.sales_available));
  const committed = Number(item.sold) + Number(item.reserved ?? 0);
  return <form onSubmit={(event) => { event.preventDefault(); onSave({ id: item.id, price: Number(price), allocation: Number(allocation), available }); }} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.sold} sold · {item.reserved ?? 0} reserved · {Math.max(0, item.allocation - committed)} remaining of {item.allocation}</p></div><span className="rounded bg-slate-100 px-2 py-1 text-xs">{item.code}</span></div><div className="mt-5 grid grid-cols-2 gap-3"><label className="text-xs text-slate-500">Price (CNY)<input disabled={!canEdit} type="number" min="0" step="1" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-50" /></label><label className="text-xs text-slate-500">Allocation<input disabled={!canEdit} type="number" min={committed} step="1" value={allocation} onChange={(event) => setAllocation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 disabled:bg-slate-50" /></label></div><div className="mt-4 flex items-center justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={available} onChange={(event) => setAvailable(event.target.checked)} />Sales available</label>{canEdit && <button disabled={saving} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white">Save settings</button>}</div></form>;
}

function PaymentSettings() {
  return <div className="max-w-3xl"><h1 className="text-2xl font-semibold">Payment settings</h1><p className="mt-1 text-sm text-slate-500">Manual WeChat Pay and Alipay verification configuration.</p><div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">Configure payment QR codes before opening sales</h2><p className="mt-2 text-sm leading-6 text-amber-900">Upload the approved personal QR images to the private <code>ticket-payment-proofs</code> bucket under <code>payment-qr/</code>, then set <code>TICKET_WECHAT_QR_PATH</code> and <code>TICKET_ALIPAY_QR_PATH</code> on the server. Checkout remains unavailable until each selected method has a configured image.</p></div><div className="mt-4 grid gap-4 sm:grid-cols-2">{[["WeChat Pay", "payment-qr/wechat.png"], ["Alipay", "payment-qr/alipay.png"]].map(([method, path]) => <div key={method} className="rounded-xl border border-slate-200 bg-white p-5"><p className="font-semibold">{method}</p><p className="mt-2 text-sm text-slate-500">Private storage object</p><code className="mt-2 block text-xs text-slate-700">{path}</code><span className="mt-4 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Manual verification</span></div>)}</div><p className="mt-4 text-xs text-slate-500">Set the server-only <code>SUPABASE_SERVICE_ROLE_KEY</code> so checkout can issue short-lived signed QR URLs and privately store proof screenshots. Never put it in a <code>NEXT_PUBLIC_</code> variable.</p></div>;
}

function Reports({ data, onExport, onLoadOrders }: { data: JsonRecord | null; onExport: () => void; onLoadOrders: () => void }) {
  return <div><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Reports</h1><p className="mt-1 text-sm text-slate-500">Approved payment totals and recorded attendance, sourced from ticket records.</p></div><button onClick={onLoadOrders} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" ><ArrowDownToLine size={15} />Open order export</button></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Total revenue" value={currency.format(Number(data?.revenue ?? 0))} icon={CircleDollarSign} /><Stat label="Tickets sold" value={Number(data?.total_tickets_sold ?? 0)} icon={Ticket} /><Stat label="Attendance" value={Number(data?.checked_in ?? 0)} icon={CheckCircle2} /><Stat label="Check-in percentage" value={`${data?.tickets_issued ? Math.round(data.checked_in * 100 / data.tickets_issued) : 0}%`} icon={Users} /></div>
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Sales by date</h2>{data?.sales_by_day?.length ? <div className="mt-4 divide-y divide-slate-100">{data.sales_by_day.map((day: JsonRecord) => <div key={day.day} className="flex justify-between py-3 text-sm"><span>{day.day}</span><span>{day.tickets} tickets</span><strong>{currency.format(Number(day.revenue))}</strong></div>)}</div> : <EmptyState>No completed ticket sales to report.</EmptyState>}</div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Revenue by ticket category</h2>{data?.revenue_by_category?.length ? data.revenue_by_category.map((row: JsonRecord) => <div key={row.code} className="flex justify-between border-b border-slate-100 py-3 text-sm"><span>{row.name} · {row.tickets} tickets</span><strong>{currency.format(Number(row.revenue))}</strong></div>) : <EmptyState>No approved ticket sales.</EmptyState>}</section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Payment method breakdown</h2>{data?.payment_methods?.length ? data.payment_methods.map((row: JsonRecord) => <div key={row.method} className="flex justify-between border-b border-slate-100 py-3 text-sm"><span>{row.method.replace("_", " ")} · {row.orders} orders</span><strong>{currency.format(Number(row.revenue))}</strong></div>) : <EmptyState>No approved payment records.</EmptyState>}</section></div>
    <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5"><div><h2 className="font-semibold">Pending payment report</h2><p className="mt-1 text-sm text-slate-500">{data?.pending_verifications ?? 0} submissions awaiting verification</p></div><button onClick={onLoadOrders} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Review pending</button></div>
    <p className="mt-4 text-xs text-slate-500">Export the orders CSV from Orders. Revenue includes only APPROVED orders.</p>
  </div>;
}

function ActivityLog({ items }: { items: JsonRecord[] }) {
  return <div><h1 className="text-2xl font-semibold">Activity log</h1><p className="mt-1 text-sm text-slate-500">Sensitive ticket and payment actions with admin identity and timestamp.</p><div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Action","Administrator","Record","Details","Timestamp"].map((name) => <th key={name} className="px-4 py-3">{name}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.action.replaceAll("_", " ")}</td><td className="px-4 py-3">{item.actor}</td><td className="px-4 py-3">{item.entity_type} · {item.entity_id}</td><td className="max-w-64 truncate px-4 py-3 text-xs text-slate-500">{JSON.stringify(item.details)}</td><td className="whitespace-nowrap px-4 py-3 text-xs">{new Date(item.created_at).toLocaleString()}</td></tr>)}</tbody></table>{!items.length && <EmptyState>No audited ticket actions recorded.</EmptyState>}</div></div>;
}
