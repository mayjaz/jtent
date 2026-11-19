import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
type Nominee = {
  id: string;
  name: string;
  image_url?: string | null;
  subtitle?: string | null;
  category_name?: string | null;
  location?: string | null;
  contestant_number?: string | null;
  age?: number | null;
  height?: string | null;
  profession?: string | null;
  hobbies?: string | null;
  motto?: string | null;
  about_me?: string | null;
  vision?: string | null;
};

export function NomineeCard({ nominee, type }: { nominee:Nominee; type:"pageant"|"awards" }) {
  const contestantDetails = [
    nominee.contestant_number,
    nominee.age,
    nominee.height,
    nominee.profession,
    nominee.hobbies,
    nominee.motto,
    nominee.about_me,
    nominee.vision
  ].some((value) => value !== null && value !== undefined && value !== "");

  return <article className="panel group overflow-hidden">
    <div className="aspect-[4/5] bg-[radial-gradient(ellipse_at_50%_35%,#51402b,#17130f_58%,#090909)] relative">
      {nominee.image_url ? <img src={nominee.image_url} alt={nominee.name} className="w-full h-full object-cover" /> :
        <div className="absolute inset-0 flex items-center justify-center"><span className="display text-7xl text-[#c9a56a]/35">{nominee.name?.slice(0,1)||"Z"}</span></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"/>
      <span className="absolute bottom-4 left-4 eyebrow">{type==="pageant"&&nominee.contestant_number?`Contestant #${nominee.contestant_number}`:nominee.subtitle || nominee.category_name || "Official nominee"}</span>
    </div>
    <div className="p-5 flex items-center justify-between gap-3"><div><h3 className="display text-xl">{nominee.name}</h3><p className="text-xs text-white/45 mt-1">{nominee.location || "China"}</p></div>
      <Link href={`/vote?type=${type}&nominee=${nominee.id}`} aria-label={`Vote for ${nominee.name}`} className="w-10 h-10 rounded-full border border-[#c9a56a]/50 flex items-center justify-center text-[#d9b77e] group-hover:bg-[#c9a56a] group-hover:text-black transition"><ArrowUpRight size={17}/></Link>
    </div>
    {type==="pageant"&&contestantDetails&&<details className="border-t border-white/10 px-5 py-4">
      <summary className="cursor-pointer text-xs uppercase tracking-widest text-[#d9b77e]">Contestant profile</summary>
      <div className="mt-4 space-y-4 text-sm text-white/65">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {nominee.age!=null&&<div><dt className="text-[10px] uppercase tracking-widest text-white/35">Age</dt><dd className="mt-1">{nominee.age}</dd></div>}
          {nominee.height&&<div><dt className="text-[10px] uppercase tracking-widest text-white/35">Height</dt><dd className="mt-1">{nominee.height}</dd></div>}
          {nominee.profession&&<div><dt className="text-[10px] uppercase tracking-widest text-white/35">Profession</dt><dd className="mt-1">{nominee.profession}</dd></div>}
          {nominee.hobbies&&<div><dt className="text-[10px] uppercase tracking-widest text-white/35">Hobbies</dt><dd className="mt-1">{nominee.hobbies}</dd></div>}
        </dl>
        {nominee.motto&&<p><span className="block text-[10px] uppercase tracking-widest text-white/35">Motto</span><span className="mt-1 block">{nominee.motto}</span></p>}
        {nominee.about_me&&<p><span className="block text-[10px] uppercase tracking-widest text-white/35">About Me</span><span className="mt-1 block leading-6">{nominee.about_me}</span></p>}
        {nominee.vision&&<p><span className="block text-[10px] uppercase tracking-widest text-white/35">My Vision</span><span className="mt-1 block leading-6">{nominee.vision}</span></p>}
      </div>
    </details>}
  </article>;
}
