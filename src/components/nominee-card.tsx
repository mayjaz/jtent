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
  return <article className="panel group overflow-hidden">
    <div className="aspect-square bg-[radial-gradient(ellipse_at_50%_35%,#51402b,#17130f_58%,#090909)] relative">
      {nominee.image_url ? <img src={nominee.image_url} alt={nominee.name} className="w-full h-full object-cover" /> :
        <div className="absolute inset-0 flex items-center justify-center"><span className="display text-7xl text-[#c9a56a]/35">{nominee.name?.slice(0,1)||"Z"}</span></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"/>
      <span className="absolute bottom-4 left-4 eyebrow">{type==="pageant"&&nominee.contestant_number?`Contestant #${nominee.contestant_number}`:nominee.subtitle || nominee.category_name || "Official nominee"}</span>
    </div>
    <div className="p-5 flex items-center justify-between gap-3"><div><h3 className="display text-xl">{nominee.name}</h3><p className="text-xs text-white/45 mt-1">{type==="pageant"?"Contestant":(nominee.location||"China")}</p></div>
      <Link href={type==="pageant"?`/pageant/${nominee.id}`:`/vote?type=${type}&nominee=${nominee.id}`} aria-label={type==="pageant"?`View ${nominee.name}'s profile`:`Vote for ${nominee.name}`} className="w-10 h-10 rounded-full border border-[#c9a56a]/50 flex items-center justify-center text-[#d9b77e] group-hover:bg-[#c9a56a] group-hover:text-black transition"><ArrowUpRight size={17}/></Link>
    </div>
  </article>;
}
