"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, LockKeyhole, Vote as VoteIcon } from "lucide-react";
type Nominee = {id:string;name:string;track:"pageant"|"awards";image_url:string|null;category_id:string;category:{id:string;name:string}};
export default function VotePage() {
 const supabase = useMemo(()=>createClient(),[]);
 const [track,setTrack]=useState<"pageant"|"awards">("pageant");
 const [items,setItems]=useState<Nominee[]>([]);
 const [user,setUser]=useState<any>(null);
 const [selected,setSelected]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [voted,setVoted]=useState<string[]>([]);
 const [email,setEmail]=useState("");
 const [sent,setSent]=useState(false);
 useEffect(() => {
   const params = new URLSearchParams(window.location.search);
   const type = params.get("type");
   if (type === "awards" || type === "pageant") {
     setTrack(type);
   }
 }, []);
 useEffect(()=>{supabase.auth.getUser().then((result:any)=>setUser(result?.data?.user ?? null));},[supabase]);
 useEffect(()=>{(async()=>{setSelected("");setMessage("");setError("");const result:any = await supabase.from("nominees").select("id,name,track,image_url,category_id,categories(id,name)").eq("track",track).eq("published",true).order("sort_order");setItems((result?.data || []) as any);})();},[track,supabase]);
 useEffect(()=>{if(user){supabase.from("votes").select("category_id").eq("user_id",user.id).then((result:any)=>setVoted((result?.data || []).map((v:any)=>v.category_id)));}},[user,supabase]);
 const categories=Array.from(new Map(items.map(n=>[n.category.id,n.category])).values());
 async function signIn(e:any){e.preventDefault();setError("");const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin+"/auth/callback"}});if(error)setError(error.message);else setSent(true);}
 async function castVote(){if(!selected||!user)return;setBusy(true);setError("");setMessage("");const {error}=await supabase.rpc("cast_vote",{p_nominee_id:selected});setBusy(false);if(error)setError(error.message);else{setMessage("Your vote has been securely recorded. Thank you for supporting excellence.");const chosen=items.find(n=>n.id===selected);if(chosen)setVoted(v=>[...v,chosen.category_id]);setSelected("");}}
 return <main className="max-w-6xl mx-auto px-6 py-20 min-h-[75vh]">
  <p className="eyebrow">Your voice matters</p><h1 className="display text-5xl md:text-7xl mt-5">Cast your <span className="gold-text">vote.</span></h1>
  <p className="text-white/50 max-w-2xl leading-7 mt-5">Choose a programme, select a category and support the nominee you believe deserves recognition.</p>
  <div className="flex gap-2 mt-10 border-b border-white/10"><button onClick={()=>setTrack("pageant")} className={`px-5 py-4 text-xs tracking-widest uppercase ${track==="pageant"?"text-[#d9b77e] border-b border-[#c9a56a]":"text-white/45"}`}>Miss Zimbabwe China</button><button onClick={()=>setTrack("awards")} className={`px-5 py-4 text-xs tracking-widest uppercase ${track==="awards"?"text-[#d9b77e] border-b border-[#c9a56a]":"text-white/45"}`}>Excellence Awards</button></div>
  {!user ? <div className="panel max-w-xl p-8 md:p-10 mt-10"><LockKeyhole className="text-[#c9a56a]" size={25}/><h2 className="display text-3xl mt-5">Sign in with email</h2><p className="text-white/45 text-sm leading-6 mt-3">{items.length === 0 ? "Nominees have not been published yet. You can still sign in now; voting will be available when nominations are announced." : "Enter your email address. We’ll send a secure sign-in link to verify your account before you vote."}</p>{sent?<p className="text-[#d9b77e] text-sm mt-6">Check your inbox for your secure sign-in link.</p>:<form onSubmit={signIn} className="mt-7"><label className="eyebrow block mb-3">Email address</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="w-full bg-black/40 border border-white/15 px-4 py-4 outline-none focus:border-[#c9a56a] text-sm"/><button className="btn-gold w-full mt-4 py-4 text-xs uppercase tracking-widest font-bold">Send secure sign-in link</button></form>}{error&&<p className="text-red-300 text-xs mt-4">{error}</p>}</div> :
  <div className="mt-10 grid lg:grid-cols-[1fr_320px] gap-10"><div>{categories.length?categories.map(cat=>{const options=items.filter(n=>n.category.id===cat.id);const already=voted.includes(cat.id);return <section key={cat.id} className="mb-12"><div className="flex justify-between items-center mb-5"><h2 className="display text-2xl">{cat.name}</h2>{already?<span className="text-[10px] uppercase tracking-widest text-emerald-300">Vote recorded</span>:<span className="text-[10px] uppercase tracking-widest text-white/35">{options.length} nominees</span>}</div><div className="grid sm:grid-cols-2 gap-3">{options.map(n=><button disabled={already} key={n.id} onClick={()=>setSelected(n.id)} className={`panel text-left p-4 flex items-center gap-4 transition ${selected===n.id?"border-[#c9a56a] bg-[#c9a56a]/10":"hover:border-white/40"} ${already?"opacity-40":""}`}><div className="w-14 h-16 bg-white/5 overflow-hidden flex-shrink-0">{n.image_url&&<img src={n.image_url} alt="" className="w-full h-full object-cover"/>}</div><span className="flex-1"><span className="block display text-lg">{n.name}</span><span className="text-[10px] text-white/40 uppercase tracking-widest">{track==="pageant"?"Contestant":"Nominee"}</span></span><span className={`w-4 h-4 rounded-full border ${selected===n.id?"bg-[#c9a56a] border-[#c9a56a]":"border-white/30"}`}/></button>)}</div></section>}) : <div className="panel p-10 text-white/45 text-sm">Voting nominees have not been published yet.</div>}</div>
  <aside className="panel p-6 h-fit lg:sticky lg:top-28"><VoteIcon className="text-[#c9a56a]" size={24}/><h3 className="display text-2xl mt-5">Your selection</h3><p className="text-white/45 text-xs leading-6 mt-3">{selected?items.find(n=>n.id===selected)?.name:"Select a nominee from an open category."}</p><button disabled={!selected||busy} onClick={castVote} className="btn-gold w-full py-4 mt-7 text-[10px] uppercase tracking-widest font-bold disabled:opacity-40">{busy?"Submitting…":"Confirm vote"}</button><p className="text-white/30 text-[10px] leading-5 mt-4">Votes are final once submitted.</p><button onClick={()=>supabase.auth.signOut().then(()=>setUser(null))} className="text-white/40 text-[10px] uppercase tracking-widest mt-7">Sign out</button></aside></div>}
  {message&&<div className="panel p-5 mt-8 flex gap-3 items-center text-emerald-200 text-sm"><CheckCircle2 size={19}/>{message}</div>}{error&&<p className="text-red-300 text-sm mt-6">{error}</p>}
 </main>
}
