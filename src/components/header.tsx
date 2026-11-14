"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
const links = [{href:"/pageant",label:"The Pageant"},{href:"/awards",label:"The Awards"},{href:"/tickets",label:"Tickets"},{href:"/#about",label:"About"},{href:"/#contact",label:"Contact"},{href:"/sponsors",label:"Sponsors"}];
export function Header() {
  const [open,setOpen] = useState(false);
  const pathname = usePathname();
  if (pathname.startsWith("/admin/tickets") || pathname === "/admin/login") return null;
  return <header className="sticky top-0 z-50 border-b border-white/10 bg-[#090909]/90 backdrop-blur-xl">
    <div className="max-w-7xl mx-auto px-6 h-[76px] flex items-center justify-between">
      <Link href="/" className="leading-none"><span className="display gold-text text-2xl tracking-[.12em]">ZIM</span><span className="block text-[8px] tracking-[.35em] text-white/60 mt-1">EXCELLENCE · CHINA</span></Link>
      <nav className="hidden md:flex items-center gap-9 text-[11px] tracking-[.16em] uppercase text-white/65">{links.map(l=><Link key={l.href} href={l.href} className="hover:text-[#d9b77e] transition">{l.label}</Link>)}</nav>
      <Link href="/vote" className="hidden md:inline-flex btn-gold px-5 py-3 text-[10px] tracking-[.16em] uppercase font-semibold">Vote now</Link>
      <button onClick={()=>setOpen(!open)} className="md:hidden text-white/80" aria-label="Toggle menu">{open?<X/>:<Menu/>}</button>
    </div>
    {open&&<nav className="md:hidden px-6 pb-6 flex flex-col gap-5 text-xs uppercase tracking-widest">{links.map(l=><Link onClick={()=>setOpen(false)} key={l.href} href={l.href}>{l.label}</Link>)}<Link href="/vote" className="text-[#d9b77e]">Vote now</Link></nav>}
  </header>;
}
