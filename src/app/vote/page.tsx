"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sortContestantsByNumber } from "@/lib/contestant-sort";

type Nominee = {
  id: string;
  name: string;
  track: "pageant" | "awards";
  image_url: string | null;
  category_id: string;
  category: { id: string; name: string };
  contestant_number?: string | null;
  sort_order?: number | null;
};

export default function VotePage() {
  const supabase = useMemo(() => createClient(), []);
  const [track, setTrack] = useState<"pageant" | "awards">("pageant");
  const [items, setItems] = useState<Nominee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("type");
    if (type === "awards" || type === "pageant") setTrack(type);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadNominees() {
      setLoading(true);
      setError("");
      const { data, error: requestError } = await supabase
        .from("nominees")
        .select("id,name,track,image_url,category_id,contestant_number,sort_order,category:categories(id,name)")
        .eq("track", track)
        .eq("published", true)
        .order("sort_order");

      if (!active) return;
      if (requestError) {
        setError(requestError.message);
        setItems([]);
      } else {
        setItems(track === "pageant"
          ? sortContestantsByNumber((data ?? []) as Nominee[])
          : ((data ?? []) as Nominee[]));
      }
      setLoading(false);
    }

    void loadNominees();
    return () => {
      active = false;
    };
  }, [supabase, track]);

  const categories = Array.from(new Map(items.map((nominee) => [nominee.category.id, nominee.category])).values());

  return <main className="max-w-6xl mx-auto px-6 py-20 min-h-[75vh]">
    <p className="eyebrow">Meet the nominees</p>
    <h1 className="display text-5xl md:text-7xl mt-5">Celebrating <span className="gold-text">excellence.</span></h1>
    <p className="text-white/50 max-w-2xl leading-7 mt-5">Explore the published contestants and nominees across our programmes.</p>

    <div role="status" className="panel mt-8 border-[#c9a56a]/30 p-5 text-sm text-[#e6c995]">
      Voting is currently disabled. You can still browse the published nominees.
    </div>

    <div className="flex gap-2 mt-10 border-b border-white/10">
      <button onClick={() => setTrack("pageant")} aria-pressed={track === "pageant"} className={`px-5 py-4 text-xs tracking-widest uppercase ${track === "pageant" ? "text-[#d9b77e] border-b border-[#c9a56a]" : "text-white/45"}`}>Miss Zimbabwe China</button>
      <button onClick={() => setTrack("awards")} aria-pressed={track === "awards"} className={`px-5 py-4 text-xs tracking-widest uppercase ${track === "awards" ? "text-[#d9b77e] border-b border-[#c9a56a]" : "text-white/45"}`}>Excellence Awards</button>
    </div>

    {loading ? <div className="panel mt-8 p-10 text-sm text-white/45">Loading published nominees…</div>
      : error ? <div role="alert" className="panel mt-8 p-5 text-sm text-red-300">Could not load nominees: {error}</div>
        : categories.length ? categories.map((category) => {
          const nominees = items.filter((nominee) => nominee.category.id === category.id);
          return <section key={category.id} className="mt-10">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
              <h2 className="display text-2xl">{category.name}</h2>
              <span className="text-[10px] uppercase tracking-widest text-white/35">{nominees.length} nominees</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {nominees.map((nominee) => <article key={nominee.id} className="panel flex items-center gap-4 p-4">
                <div className="h-16 w-14 flex-shrink-0 overflow-hidden bg-white/5">
                  {nominee.image_url && <img src={nominee.image_url} alt={nominee.name} className="h-full w-full object-cover" />}
                </div>
                <div>
                  <h3 className="display text-lg">{nominee.name}</h3>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-white/40">{track === "pageant" ? "Contestant" : "Nominee"}</p>
                </div>
              </article>)}
            </div>
          </section>;
        })
          : <div className="panel mt-8 p-10 text-sm text-white/45">No published nominees yet.</div>}
  </main>;
}
