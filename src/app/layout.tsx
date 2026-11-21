import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Header } from "@/components/header";
export const metadata: Metadata = {
  title: "Zim Excellence | China Edition 2027",
  description: "Celebrating Zimbabwean excellence in China. Discover the nominees and cast your vote."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Header />{children}<Analytics /><footer className="border-t border-white/10 mt-24">
    <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/40">
      <span>© 2027 ZIM EXCELLENCE · CHINA EDITION</span><span>BEAUTY · CULTURE · CONFIDENCE · LEADERSHIP · EXCELLENCE</span>
    </div></footer></body></html>;
}
