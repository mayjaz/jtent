"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  nomineeId: string;
  nomineeName: string;
  votingOpen: boolean;
};

type VoteStatus = {
  already_voted: boolean;
  nominee_id: string | null;
  nominee_name: string | null;
};

export function PageantVoteButton({ nomineeId, nomineeName, votingOpen }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadStatus() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      const user = session?.user ?? null;
      setSignedIn(Boolean(user));
      setSignedInEmail(user?.email ?? null);
      const authError = new URLSearchParams(window.location.search).get("authError");
      if (authError) setError(authError);
      if (user) {
        const { data, error: statusError } = await supabase.rpc("pageant_vote_status");
        if (!active) return;
        if (statusError) setError(statusError.message);
        else {
          const status = data as VoteStatus | null;
          setAlreadyVoted(Boolean(status?.already_voted));
          setVotedFor(status?.nominee_name ?? null);
        }
      }
      setLoading(false);
    }

    void loadStatus();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function sendSignInLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const next = window.location.pathname;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (signInError) setError(signInError.message);
    else setMessage("Check your email and open the sign-in link. You’ll return here to cast your vote.");
    setBusy(false);
  }

  async function castVote() {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: voteError } = await supabase.rpc("cast_vote", { p_nominee_id: nomineeId });
    if (voteError) {
      setError(voteError.message);
    } else {
      setAlreadyVoted(true);
      setMessage(`Your vote for ${nomineeName} has been recorded. You can vote again tomorrow (China time).`);
    }
    setBusy(false);
  }

  async function signOut() {
    setBusy(true);
    setError("");
    setMessage("");
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    } else {
      setSignedIn(false);
      setSignedInEmail(null);
      setAlreadyVoted(false);
      setVotedFor(null);
      setEmail("");
    }
    setBusy(false);
  }

  if (!votingOpen) {
    return <div className="panel p-5 text-sm text-white/55">Voting is currently closed for this category.</div>;
  }

  if (loading) {
    return <div className="panel p-5 text-sm text-white/55">Checking your voting status…</div>;
  }

  return <section className="panel p-6">
    <h2 className="display text-2xl">Cast your vote</h2>
    <p className="mt-2 text-sm leading-6 text-white/55">You can vote for one pageant contestant each day. The daily limit resets at midnight China time.</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    {message && <p role="status" className="mt-4 text-sm text-[#e6c995]">{message}</p>}
    {alreadyVoted
      ? !message && <p className="mt-5 text-sm text-white/70">{votedFor ? `You voted for ${votedFor} today.` : "You’ve already voted in the pageant today."} The limit resets at midnight China time.</p>
      : signedIn
        ? <button onClick={castVote} disabled={busy} className="btn-gold mt-5 px-6 py-3 text-xs uppercase tracking-widest font-bold disabled:opacity-50">
          {busy ? "Recording vote…" : `Vote for ${nomineeName}`}
        </button>
        : <form onSubmit={sendSignInLink} className="mt-5">
          <label htmlFor="voter-email" className="eyebrow mb-2 block">Email address</label>
          <input id="voter-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]" />
          <button disabled={busy} className="btn-gold mt-4 px-6 py-3 text-xs uppercase tracking-widest font-bold disabled:opacity-50">
            {busy ? "Sending link…" : "Email me a sign-in link"}
          </button>
          <p className="mt-3 text-xs leading-5 text-white/40">A verified email account is required. After signing in, return to this page to vote.</p>
        </form>}
    {signedIn && <div className="mt-5 border-t border-white/10 pt-4">
      {signedInEmail && <p className="text-xs text-white/45">Signed in as {signedInEmail}</p>}
      <button type="button" onClick={signOut} disabled={busy} className="mt-3 text-xs uppercase tracking-widest text-[#d9b77e] disabled:opacity-50">
        {busy ? "Signing out…" : "Sign out / use another email"}
      </button>
    </div>}
  </section>;
}
