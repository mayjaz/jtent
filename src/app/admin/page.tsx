"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LockKeyhole, Plus, RefreshCw } from "lucide-react";

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user,setUser] = useState<any>(null);
  const [allowed,setAllowed] = useState(false);
  const [loading,setLoading] = useState(true);
  const [categories,setCategories] = useState<any[]>([]);
  const [nominees,setNominees] = useState<any[]>([]);
  const [votes,setVotes] = useState<any[]>([]);
  const [categoryName,setCategoryName] = useState("");
  const [track,setTrack] = useState("pageant");
  const [nomineeName,setNomineeName] = useState("");
  const [categoryId,setCategoryId] = useState("");
  const [imageUrl,setImageUrl] = useState("");
  const [notice,setNotice] = useState("");

  async function load() {
    setLoading(true);
    const {data:{user}} = await supabase.auth.getUser();
    setUser(user);
    if (!user) { setAllowed(false); setLoading(false); return; }
    const {data:profile} = await supabase.from("profiles").select("role").eq("id",user.id).single();
    const isAdmin = profile?.role === "admin";
    setAllowed(isAdmin);
    if (isAdmin) {
      const [c,n,v] = await Promise.all([
        supabase.from("categories").select("*").order("sort_order"),
        supabase.from("nominees").select("*").order("sort_order"),
        supabase.from("votes").select("nominee_id,category_id")
      ]);
      setCategories(c.data||[]); setNominees(n.data||[]); setVotes(v.data||[]);
    }
    setLoading(false);
  }
  useEffect(()=>{load();},[]);
  async function addCategory(e:any) {
    e.preventDefault(); setNotice("");
    const {error} = await supabase.from("categories").insert({name:categoryName,track,sort_order:categories.length});
    if(error) setNotice(error.message); else {setCategoryName("");setNotice("Category created.");load();}
  }
  async function addNominee(e:any) {
    e.preventDefault(); setNotice("");
    const cat=categories.find(c=>c.id===categoryId);
    if(!cat) return setNotice("Choose a category.");
    const {error} = await supabase.from("nominees").insert({name:nomineeName,category_id:categoryId,track:cat.track,image_url:imageUrl||null,published:false,sort_order:nominees.length});
    if(error) setNotice(error.message); else {setNomineeName("");setImageUrl("");setNotice("Nominee added as a draft.");load();}
  }
  async function toggleCategory(c:any) {
    const {error}=await supabase.from("categories").update({voting_open:!c.voting_open}).eq("id",c.id);
    setNotice(error?.message || `Voting ${c.voting_open?"closed":"opened"} for ${c.name}.`);load();
  }
  async function togglePublished(n:any) {
    const {error}=await supabase.from("nominees").update({published:!n.published}).eq("id",n.id);
    setNotice(error?.message || "Nominee status updated.");load();
  }
  const counts = votes.reduce((a:any,v:any)=>{a[v.nominee_id]=(a[v.nominee_id]||0)+1;return a;},{});
  if(loading) return <main className="max-w-6xl mx-auto px-6 py-24 text-white/50">Loading organiser workspace…</main>;
  if(!allowed) return <main className="max-w-xl mx-auto px-6 py-24 min-h-[70vh]"><div className="panel p-9"><LockKeyhole className="text-[#c9a56a]" size={26}/><h1 className="display text-3xl mt-5">Access restricted</h1><p className="text-white/50 text-sm leading-6 mt-3">This page is available to authorised accounts only.</p>{user&&<button onClick={()=>supabase.auth.signOut().then(()=>setUser(null))} className="text-[#d9b77e] text-xs uppercase tracking-widest mt-7">Sign out</button>}</div></main>;
  return <main className="max-w-7xl mx-auto px-6 py-16 min-h-[70vh]">
    <div className="flex flex-wrap justify-between items-end gap-5"><div><p className="eyebrow">Private workspace</p><h1 className="display text-5xl mt-4">Event <span className="gold-text">control.</span></h1><p className="text-white/45 text-sm mt-3">Manage categories, nominees and live voting status.</p></div><button onClick={load} className="border border-white/15 px-4 py-3 text-xs flex gap-2 items-center"><RefreshCw size={14}/> Refresh data</button></div>
    {notice&&<p className="panel p-4 mt-7 text-sm text-[#e6c995]">{notice}</p>}
    <div className="grid lg:grid-cols-2 gap-5 mt-10">
      <form onSubmit={addCategory} className="panel p-7"><Plus className="text-[#c9a56a]" size={20}/><h2 className="display text-2xl mt-4">Create category</h2><label className="eyebrow block mt-6 mb-2">Category name</label><input required value={categoryName} onChange={e=>setCategoryName(e.target.value)} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]"/><label className="eyebrow block mt-5 mb-2">Programme</label><select value={track} onChange={e=>setTrack(e.target.value)} className="w-full bg-black border border-white/15 p-3 text-sm"><option value="pageant">Miss Zimbabwe China</option><option value="awards">Excellence Awards</option></select><button className="btn-gold px-5 py-3 mt-6 text-[10px] uppercase tracking-widest font-bold">Add category</button></form>
      <form onSubmit={addNominee} className="panel p-7"><Plus className="text-[#c9a56a]" size={20}/><h2 className="display text-2xl mt-4">Add nominee</h2><label className="eyebrow block mt-6 mb-2">Nominee name</label><input required value={nomineeName} onChange={e=>setNomineeName(e.target.value)} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]"/><label className="eyebrow block mt-5 mb-2">Category</label><select required value={categoryId} onChange={e=>setCategoryId(e.target.value)} className="w-full bg-black border border-white/15 p-3 text-sm"><option value="">Select category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name} · {c.track}</option>)}</select><label className="eyebrow block mt-5 mb-2">Portrait image URL (optional)</label><input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]"/><button className="btn-gold px-5 py-3 mt-6 text-[10px] uppercase tracking-widest font-bold">Add draft nominee</button></form>
    </div>
    <section className="mt-14"><div className="flex justify-between items-end border-b border-white/10 pb-4"><h2 className="display text-3xl">Voting categories</h2><span className="text-xs text-white/40">{categories.length} total</span></div><div className="divide-y divide-white/10">{categories.map(c=><div key={c.id} className="py-5 flex flex-wrap justify-between items-center gap-4"><div><p className="display text-xl">{c.name}</p><p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{c.track} · {nominees.filter(n=>n.category_id===c.id).length} nominees</p></div><div className="flex items-center gap-4"><span className={`text-[10px] uppercase tracking-widest ${c.voting_open?"text-emerald-300":"text-white/35"}`}>{c.voting_open?"Voting open":"Voting closed"}</span><button onClick={()=>toggleCategory(c)} className="border border-[#c9a56a]/50 px-4 py-2 text-[10px] uppercase tracking-widest">{c.voting_open?"Close voting":"Open voting"}</button></div></div>)}</div></section>
    <section className="mt-14"><div className="flex justify-between items-end border-b border-white/10 pb-4"><h2 className="display text-3xl">Nominee management</h2><span className="text-xs text-white/40">{votes.length} votes recorded</span></div><div className="divide-y divide-white/10">{nominees.map(n=><div key={n.id} className="py-4 flex flex-wrap items-center justify-between gap-4"><div><p className="display text-lg">{n.name}</p><p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{categories.find(c=>c.id===n.category_id)?.name||"Category"} · {counts[n.id]||0} votes</p></div><button onClick={()=>togglePublished(n)} className={`border px-4 py-2 text-[10px] uppercase tracking-widest ${n.published?"border-emerald-500/40 text-emerald-300":"border-white/20 text-white/50"}`}>{n.published?"Published · unpublish":"Draft · publish"}</button></div>)}</div></section>
  </main>;
}
