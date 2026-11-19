"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const ticketAdminRoles = new Set(["super_admin", "ticket_manager", "checkin_staff"]);

export default function TicketAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw new Error(signInError.message);

      const { data: role, error: roleError } = await supabase.rpc("ticket_admin_role");
      if (roleError) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw new Error(`Could not verify ticket admin access (${roleError.message}) or clear the sign-in session (${signOutError.message})`);
        throw new Error(`Could not verify ticket admin access: ${roleError.message}`);
      }
      if (!ticketAdminRoles.has(role)) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) throw new Error(`This account has no ticket administrator role, and sign-out failed: ${signOutError.message}`);
        throw new Error("This account does not have a ticket administrator role.");
      }

      router.replace("/admin/tickets");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="admin-auth flex min-h-screen items-center justify-center bg-[#f7f8fa] px-5 py-12 text-slate-800">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white"><LockKeyhole size={20} /></div>
      <p className="mt-7 text-xs font-semibold uppercase tracking-[.16em] text-slate-400">ZIM Excellence · China Edition 2027</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Ticket admin sign in</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Use your authorized administrator email and password.</p>

      <form onSubmit={signIn} className="mt-7 space-y-4">
        <div>
          <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
          <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" placeholder="admin@example.com" />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
        </div>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>
  </main>;
}
