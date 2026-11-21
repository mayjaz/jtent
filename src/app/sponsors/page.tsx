import { Handshake } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sponsors",
  description: "Meet the organisations and partners supporting Zim Excellence China 2027.",
  alternates: { canonical: "/sponsors" }
};

export default function SponsorsPage() {
  return (
    <main className="max-w-6xl mx-auto px-6 py-20 min-h-[70vh]">
      <p className="eyebrow">Together, we make it possible</p>
      <h1 className="display text-5xl md:text-7xl mt-5">Our <span className="gold-text">sponsors.</span></h1>
      <section className="panel max-w-2xl p-8 md:p-10 mt-12">
        <Handshake className="text-[#c9a56a]" size={28} aria-hidden="true" />
        <h2 className="display text-3xl mt-5">Sponsor announcements coming soon</h2>
        <p className="text-white/50 text-sm leading-7 mt-4">
          We look forward to recognising the partners supporting Zimbabwean excellence in China.
        </p>
      </section>
    </main>
  );
}
