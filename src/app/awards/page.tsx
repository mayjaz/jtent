import { createClient } from "@/lib/supabase/server";
import { NomineeCard } from "@/components/nominee-card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zim Excellence Awards Nominees",
  description: "Explore the Zim Excellence Awards categories and nominees recognising Zimbabwean achievement, leadership and impact in China.",
  alternates: { canonical: "/awards" }
};

export default async function AwardsPage() {
 const supabase = await createClient();
 const {data: nominees} = await supabase.from("nominees").select("*, categories(name)").eq("track","awards").eq("published",true).order("sort_order");
 const grouped = (nominees||[]).reduce((acc:any,n:any)=>{const k=n.categories?.name||"Excellence Awards";(acc[k] ||= []).push(n);return acc;},{});
 return <main className="max-w-7xl mx-auto px-6 py-20 min-h-[70vh]">
  <p className="eyebrow">Achievement · Leadership · Impact</p><h1 className="display text-5xl md:text-7xl mt-5">Zim Excellence <span className="gold-text">Awards.</span></h1>
  <p className="text-white/50 max-w-2xl leading-7 mt-6">Celebrating Zimbabweans whose achievements, innovation and contribution make a difference in China and beyond.</p>
  {Object.keys(grouped).length ? Object.entries(grouped).map(([category,items]:any)=><section key={category} className="mt-14"><div className="flex items-end justify-between border-b border-white/10 pb-4 mb-7"><h2 className="display text-3xl">{category}</h2><span className="text-white/40 text-xs">{items.length} nominees</span></div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">{items.map((n:any)=><NomineeCard key={n.id} nominee={{...n,category_name:category}} type="awards"/>)}</div></section>) : <div className="panel p-12 text-center mt-12"><h2 className="display text-2xl">Award nominees will be announced soon</h2><p className="text-white/45 text-sm mt-3">Official categories and nominees will be published here.</p></div>}
 </main>
}
