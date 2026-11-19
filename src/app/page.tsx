import Link from "next/link";
import { ArrowUpRight, Award, CalendarDays, Crown, Globe2, MapPin, Sparkles, Ticket } from "lucide-react";
import { EventCountdown } from "@/components/event-countdown";
export default function Home() {
 return <main>
  <section className="relative min-h-[680px] flex items-center overflow-hidden">
   <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"linear-gradient(90deg,rgba(9,9,9,.82) 0%,rgba(9,9,9,.56) 48%,rgba(9,9,9,.18) 100%),linear-gradient(0deg,rgba(9,9,9,.45),transparent 55%),url('/hero-zimbabwe-china.png')"}}/>
   <div className="relative max-w-7xl mx-auto px-6 py-28 w-full">
    <div className="max-w-3xl"><p className="eyebrow mb-8">A celebration of Zimbabwean distinction · 2027</p>
     <h1 className="display text-6xl sm:text-7xl md:text-[100px] leading-[.98] font-medium"><span className="gold-text">ZIM</span><br/><span className="text-white">EXCELLENCE</span></h1>
     <div className="flex items-center gap-5 my-7"><div className="h-px w-16 bg-[#c9a56a]"/><p className="text-[#d9b77e] tracking-[.38em] text-xs">CHINA EDITION</p></div>
     <p className="text-white/60 max-w-lg leading-7 text-sm md:text-base">Honouring the beauty, talent, ambition and achievements of Zimbabweans making their mark in China.</p>
     <div className="flex flex-wrap gap-4 mt-10"><Link href="/vote" className="btn-gold px-7 py-4 text-[10px] tracking-[.18em] uppercase font-bold inline-flex items-center gap-3">Cast your vote <ArrowUpRight size={15}/></Link><Link href="/#about" className="border border-white/20 px-7 py-4 text-[10px] tracking-[.18em] uppercase hover:border-[#c9a56a] transition">Discover the event</Link></div>
    </div>
   </div>
  </section>
  <EventCountdown />
  <section aria-labelledby="tickets-heading" className="max-w-7xl mx-auto px-6 pt-16">
   <div className="panel relative overflow-hidden p-8 md:p-12">
    <div aria-hidden="true" className="absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#c9a56a]/10 md:h-80 md:w-80"/>
    <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
     <div className="max-w-2xl">
      <div className="flex items-center gap-3"><Ticket className="text-[#c9a56a]" size={20}/><p className="eyebrow">Tickets are available</p></div>
      <h2 id="tickets-heading" className="display mt-5 text-4xl md:text-5xl">Be there for <span className="gold-text italic">excellence.</span></h2>
      <p className="mt-4 max-w-xl text-sm leading-7 text-white/55">Join us in Beijing for an unforgettable celebration of Zimbabwean talent, culture and achievement. Choose General Admission or VIP and complete your booking online.</p>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs tracking-wide text-white/60">
       <span className="inline-flex items-center gap-2"><CalendarDays size={15} className="text-[#c9a56a]"/>23 January 2027</span>
       <span className="inline-flex items-center gap-2"><MapPin size={15} className="text-[#c9a56a]"/>BaiFuYi Hotel · Beijing</span>
      </div>
     </div>
     <div className="flex flex-col items-start gap-3 md:items-end">
      <Link href="/tickets" className="btn-gold inline-flex items-center gap-3 px-7 py-4 text-[10px] font-bold uppercase tracking-[.18em]">Buy tickets <ArrowUpRight size={15}/></Link>
      <span className="text-xs text-white/40">Pay by WeChat Pay or Alipay</span>
     </div>
    </div>
   </div>
  </section>
  <section id="about" className="max-w-7xl mx-auto px-6 py-24">
   <div className="text-center max-w-2xl mx-auto"><p className="eyebrow">The platform</p><h2 className="display text-4xl md:text-5xl mt-5">A stage for <span className="gold-text italic">excellence.</span></h2><p className="text-white/50 text-sm leading-7 mt-5">More than an event. A meeting point for culture, community and achievement — bringing Zimbabweans across China together to recognise the people shaping our story.</p></div>
   <div className="grid md:grid-cols-2 gap-5 mt-14">
    <div className="panel p-8 md:p-10"><Crown className="text-[#c9a56a]" size={25}/><p className="eyebrow mt-8">Beauty · Culture · Confidence</p><h3 className="display text-3xl mt-3">Miss Zimbabwe China</h3><p className="text-white/50 text-sm leading-7 mt-4">A celebration of identity, confidence, talent and the next generation of Zimbabwean women in China.</p><Link href="/pageant" className="inline-flex gap-2 items-center text-[#d9b77e] text-xs tracking-widest uppercase mt-8">Meet the contestants <ArrowUpRight size={15}/></Link></div>
    <div className="panel p-8 md:p-10"><Award className="text-[#c9a56a]" size={25}/><p className="eyebrow mt-8">Achievement · Leadership · Impact</p><h3 className="display text-3xl mt-3">Zim Excellence Awards</h3><p className="text-white/50 text-sm leading-7 mt-4">Recognising Zimbabweans whose work, leadership and contribution deserve to be seen and celebrated.</p><Link href="/awards" className="inline-flex gap-2 items-center text-[#d9b77e] text-xs tracking-widest uppercase mt-8">Explore categories <ArrowUpRight size={15}/></Link></div>
   </div>
  </section>
  <section className="border-y border-white/10 bg-[#100e0b] py-20"><div className="max-w-7xl mx-auto px-6 grid md:grid-cols-3 gap-10 text-center">
   {[ [Globe2,"A global community","Connecting Zimbabweans across cities and campuses in China."],[Sparkles,"Recognising potential","Giving talent, leadership and achievement a distinguished platform."],[Crown,"A lasting legacy","Building confidence, opportunity and pride beyond the stage."] ].map(([Icon,title,desc]:any)=><div key={title}><Icon className="mx-auto text-[#c9a56a]" size={25}/><h3 className="display text-2xl mt-5">{title}</h3><p className="text-white/45 text-sm leading-6 mt-3 max-w-xs mx-auto">{desc}</p></div>)}
  </div></section>
  <section id="contact" className="max-w-7xl mx-auto px-6 py-24 text-center"><p className="eyebrow">Be part of the story</p><h2 className="display text-4xl md:text-5xl mt-5">The moment is <span className="gold-text italic">yours.</span></h2><p className="text-white/50 text-sm mt-5">Follow the journey, support the nominees and celebrate Zimbabwean excellence.</p><Link href="/vote" className="btn-gold inline-flex px-8 py-4 mt-9 text-[10px] tracking-[.18em] uppercase font-bold">Enter the voting experience</Link></section>
 </main>
}
