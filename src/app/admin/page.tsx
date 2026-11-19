"use client";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
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
  const [imageFile,setImageFile] = useState<File|null>(null);
  const [savingNominee,setSavingNominee] = useState(false);
  const [contestantFields,setContestantFields] = useState({
    contestantNumber:"",
    age:"",
    height:"",
    profession:"",
    hobbies:"",
    motto:"",
    aboutMe:"",
    vision:""
  });
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
    setSavingNominee(true);
    let uploadedPath:string|null=null;
    try {
      let uploadedImageUrl:string|null=null;
      if(cat.track==="pageant"&&imageFile) {
        const extension=imageFile.type==="image/jpeg"?"jpg":imageFile.type==="image/png"?"png":"webp";
        const storagePath=`contestants/${crypto.randomUUID()}.${extension}`;
        const {data,error:uploadError}=await supabase.storage.from("contestant-portraits").upload(storagePath,imageFile,{
          cacheControl:"3600",
          contentType:imageFile.type,
          upsert:false
        });
        if(uploadError) throw new Error(`Portrait upload failed: ${uploadError.message}`);
        uploadedPath=data.path;
        uploadedImageUrl=supabase.storage.from("contestant-portraits").getPublicUrl(data.path).data.publicUrl;
      }

      const {error} = await supabase.from("nominees").insert({
        name:nomineeName,
        category_id:categoryId,
        track:cat.track,
        image_url:cat.track==="pageant"?uploadedImageUrl:imageUrl.trim()||null,
        published:false,
        sort_order:nominees.length,
        ...(cat.track==="pageant" ? {
          contestant_number:contestantFields.contestantNumber.trim()||null,
          age:contestantFields.age===""?null:Number(contestantFields.age),
          height:contestantFields.height.trim()||null,
          profession:contestantFields.profession.trim()||null,
          hobbies:contestantFields.hobbies.trim()||null,
          motto:contestantFields.motto.trim()||null,
          about_me:contestantFields.aboutMe.trim()||null,
          vision:contestantFields.vision.trim()||null
        } : {})
      });
      if(error) throw new Error(error.message);
      uploadedPath=null;
      setNomineeName("");
      setImageUrl("");
      setImageFile(null);
      setContestantFields({contestantNumber:"",age:"",height:"",profession:"",hobbies:"",motto:"",aboutMe:"",vision:""});
      setNotice("Nominee added as a draft.");
      load();
    } catch(reason) {
      let message=reason instanceof Error?reason.message:"Could not add nominee.";
      if(uploadedPath) {
        try {
          const {error:cleanupError}=await supabase.storage.from("contestant-portraits").remove([uploadedPath]);
          if(cleanupError) message+=` Portrait cleanup failed: ${cleanupError.message}`;
        } catch(cleanupReason) {
          message+=` Portrait cleanup failed: ${cleanupReason instanceof Error?cleanupReason.message:"unknown error"}`;
        }
      }
      setNotice(message);
    } finally {
      setSavingNominee(false);
    }
  }
  function handlePortraitChange(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]??null;
    setNotice("");
    if(file&&(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024)) {
      setImageFile(null);
      event.target.value="";
      setNotice("Choose a JPEG, PNG, or WebP image that is 5 MB or less.");
      return;
    }
    setImageFile(file);
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
      <form onSubmit={addNominee} className="panel p-7">
        <Plus className="text-[#c9a56a]" size={20}/>
        <h2 className="display text-2xl mt-4">Add nominee</h2>
        <label className="eyebrow block mt-6 mb-2">Name</label>
        <input required value={nomineeName} onChange={e=>setNomineeName(e.target.value)} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]"/>
        <label className="eyebrow block mt-5 mb-2">Category</label>
        <select required value={categoryId} onChange={e=>{setCategoryId(e.target.value);setImageFile(null);setImageUrl("");}} className="w-full bg-black border border-white/15 p-3 text-sm">
          <option value="">Select category</option>
          {categories.map(c=><option key={c.id} value={c.id}>{c.name} · {c.track}</option>)}
        </select>
        {categories.find(c=>c.id===categoryId)?.track==="pageant" ? <>
          <label className="eyebrow block mt-5 mb-2">Portrait image (optional · JPEG, PNG or WebP · max 5 MB)</label>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePortraitChange} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]"/>
          {imageFile&&<p className="mt-2 text-xs text-white/45">Selected: {imageFile.name}</p>}
        </> : <>
          <label className="eyebrow block mt-5 mb-2">Portrait image URL (optional)</label>
          <input value={imageUrl} onChange={e=>setImageUrl(e.target.value)} className="w-full bg-black/40 border border-white/15 p-3 text-sm outline-none focus:border-[#c9a56a]"/>
        </>}
        {categories.find(c=>c.id===categoryId)?.track==="pageant" && <>
          <h3 className="eyebrow mt-7 border-t border-white/10 pt-5">Contestant profile</h3>
          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <label className="text-xs text-white/60">Contestant number<input value={contestantFields.contestantNumber} onChange={e=>setContestantFields({...contestantFields,contestantNumber:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60">Age<input type="number" min="0" step="1" value={contestantFields.age} onChange={e=>setContestantFields({...contestantFields,age:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60">Height<input value={contestantFields.height} onChange={e=>setContestantFields({...contestantFields,height:e.target.value})} placeholder="e.g. 168 cm" className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60">Profession<input value={contestantFields.profession} onChange={e=>setContestantFields({...contestantFields,profession:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60 sm:col-span-2">Hobbies<textarea rows={2} value={contestantFields.hobbies} onChange={e=>setContestantFields({...contestantFields,hobbies:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60 sm:col-span-2">Motto<textarea rows={2} value={contestantFields.motto} onChange={e=>setContestantFields({...contestantFields,motto:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60 sm:col-span-2">About Me<textarea rows={4} value={contestantFields.aboutMe} onChange={e=>setContestantFields({...contestantFields,aboutMe:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
            <label className="text-xs text-white/60 sm:col-span-2">My Vision<textarea rows={4} value={contestantFields.vision} onChange={e=>setContestantFields({...contestantFields,vision:e.target.value})} className="mt-2 w-full bg-black/40 border border-white/15 p-3 text-sm text-white outline-none focus:border-[#c9a56a]"/></label>
          </div>
        </>}
        <button disabled={savingNominee} className="btn-gold px-5 py-3 mt-6 text-[10px] uppercase tracking-widest font-bold disabled:opacity-50">{savingNominee?"Saving nominee…":"Add draft nominee"}</button>
      </form>
    </div>
    <section className="mt-14"><div className="flex justify-between items-end border-b border-white/10 pb-4"><h2 className="display text-3xl">Voting categories</h2><span className="text-xs text-white/40">{categories.length} total</span></div><div className="divide-y divide-white/10">{categories.map(c=><div key={c.id} className="py-5 flex flex-wrap justify-between items-center gap-4"><div><p className="display text-xl">{c.name}</p><p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{c.track} · {nominees.filter(n=>n.category_id===c.id).length} nominees</p></div><div className="flex items-center gap-4"><span className={`text-[10px] uppercase tracking-widest ${c.voting_open?"text-emerald-300":"text-white/35"}`}>{c.voting_open?"Voting open":"Voting closed"}</span><button onClick={()=>toggleCategory(c)} className="border border-[#c9a56a]/50 px-4 py-2 text-[10px] uppercase tracking-widest">{c.voting_open?"Close voting":"Open voting"}</button></div></div>)}</div></section>
    <section className="mt-14"><div className="flex justify-between items-end border-b border-white/10 pb-4"><h2 className="display text-3xl">Nominee management</h2><span className="text-xs text-white/40">{votes.length} votes recorded</span></div><div className="divide-y divide-white/10">{nominees.map(n=><div key={n.id} className="py-4 flex flex-wrap items-center justify-between gap-4"><div><p className="display text-lg">{n.name}</p><p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{categories.find(c=>c.id===n.category_id)?.name||"Category"} · {counts[n.id]||0} votes</p></div><button onClick={()=>togglePublished(n)} className={`border px-4 py-2 text-[10px] uppercase tracking-widest ${n.published?"border-emerald-500/40 text-emerald-300":"border-white/20 text-white/50"}`}>{n.published?"Published · unpublish":"Draft · publish"}</button></div>)}</div></section>
  </main>;
}
