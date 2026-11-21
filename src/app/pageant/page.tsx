import { createClient } from "@/lib/supabase/server";
import { NomineeCard } from "@/components/nominee-card";
import { sortContestantsByNumber } from "@/lib/contestant-sort";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Miss Zimbabwe China Contestants",
  description: "Meet the Miss Zimbabwe China contestants, view their profiles, and cast a daily vote for the pageant contestant representing Zimbabwean excellence.",
  alternates: { canonical: "/pageant" }
};

export default async function PageantPage() {
 const supabase = await createClient();
 const {data: nominees} = await supabase.from("nominees").select("*, categories(name)").eq("track","pageant").eq("published",true).order("sort_order");
 const orderedNominees = sortContestantsByNumber(nominees ?? []);
 return <main className="max-w-7xl mx-auto px-6 py-20 min-h-[70vh]">
  <p className="eyebrow">Beauty · Culture · Confidence</p><h1 className="display text-5xl md:text-7xl mt-5">Miss Zimbabwe <span className="gold-text">China.</span></h1>
  <p className="text-white/50 max-w-2xl leading-7 mt-6">Meet the women representing Zimbabwean excellence in China. Open a contestant profile to learn her story and cast your daily vote.</p>
  <div className="flex items-center justify-between border-y border-white/10 py-5 mt-12 mb-8"><span className="text-xs text-white/45">{nominees?.length || 0} published contestants</span><Link href="/vote?type=pageant" className="text-[#d9b77e] text-xs tracking-widest uppercase">Voting details ↗</Link></div>
  {orderedNominees.length ? <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">{orderedNominees.map((n:any)=><NomineeCard key={n.id} nominee={{...n,category_name:n.categories?.name}} type="pageant"/>)}</div> : <div className="panel p-12 text-center"><h2 className="display text-2xl">Contestants will be announced soon</h2><p className="text-white/45 text-sm mt-3">The official contestant profiles will appear here once published.</p></div>}
 </main>
}
