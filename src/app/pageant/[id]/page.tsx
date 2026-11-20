import { notFound } from "next/navigation";
import Link from "next/link";
import { PageantVoteButton } from "@/components/pageant-vote-button";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContestantPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: nominee, error } = await supabase
    .from("nominees")
    .select("*, categories(id,name,track,voting_open,starts_at,ends_at)")
    .eq("id", id)
    .eq("track", "pageant")
    .eq("published", true)
    .single();

  if (error || !nominee || nominee.categories?.track !== "pageant") notFound();

  const now = Date.now();
  const votingOpen = Boolean(nominee.categories.voting_open)
    && (!nominee.categories.starts_at || Date.parse(nominee.categories.starts_at) <= now)
    && (!nominee.categories.ends_at || Date.parse(nominee.categories.ends_at) >= now);

  return <main className="max-w-6xl mx-auto px-6 py-16 min-h-[70vh]">
    <Link href="/pageant" className="text-xs uppercase tracking-widest text-[#d9b77e]">← All contestants</Link>
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] mt-8">
      <div className="panel overflow-hidden">
        <div className="aspect-[4/5] max-h-[780px] bg-[radial-gradient(ellipse_at_50%_35%,#51402b,#17130f_58%,#090909)]">
          {nominee.image_url
            ? <img src={nominee.image_url} alt={nominee.name} className="h-full w-full object-cover" />
            : <div className="flex h-full items-center justify-center"><span className="display text-8xl text-[#c9a56a]/35">{nominee.name.slice(0, 1)}</span></div>}
        </div>
      </div>
      <div className="py-2">
        <p className="eyebrow">{nominee.contestant_number ? `Contestant #${nominee.contestant_number}` : "Miss Zimbabwe China"}</p>
        <h1 className="display text-5xl md:text-6xl mt-4">{nominee.name}</h1>
        <p className="mt-3 text-sm text-white/50">{nominee.categories.name}{nominee.location ? ` · ${nominee.location}` : ""}</p>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-5 mt-8 border-y border-white/10 py-6">
          {nominee.age != null && <div><dt className="eyebrow">Age</dt><dd className="mt-1 text-sm">{nominee.age}</dd></div>}
          {nominee.height && <div><dt className="eyebrow">Height</dt><dd className="mt-1 text-sm">{nominee.height}</dd></div>}
          {nominee.profession && <div><dt className="eyebrow">Profession</dt><dd className="mt-1 text-sm">{nominee.profession}</dd></div>}
          {nominee.hobbies && <div><dt className="eyebrow">Hobbies</dt><dd className="mt-1 text-sm">{nominee.hobbies}</dd></div>}
        </dl>

        <div className="space-y-6 py-7 text-sm leading-7 text-white/65">
          {nominee.motto && <p><span className="eyebrow mb-2 block">Motto</span>{nominee.motto}</p>}
          {nominee.about_me && <p><span className="eyebrow mb-2 block">About me</span>{nominee.about_me}</p>}
          {nominee.vision && <p><span className="eyebrow mb-2 block">My vision</span>{nominee.vision}</p>}
        </div>

        <PageantVoteButton
          nomineeId={nominee.id}
          nomineeName={nominee.name}
          votingOpen={votingOpen}
        />
      </div>
    </div>
  </main>;
}
