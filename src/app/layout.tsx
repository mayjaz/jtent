import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Header } from "@/components/header";
export const metadata: Metadata = {
  metadataBase: new URL("https://www.jt-entertainment.org"),
  title: {
    default: "Zim Excellence China 2027",
    template: "%s | Zim Excellence China"
  },
  description: "Celebrating Zimbabwean excellence in China through the Miss Zimbabwe China pageant, Zim Excellence Awards, nominee voting, and the 2027 Beijing event.",
  keywords: ["Zim Excellence", "Zimbabwe Excellence China", "Miss Zimbabwe China", "Zimbabwe awards China", "Zimbabwean pageant China", "Beijing Zimbabwe event"],
  authors: [{ name: "JT Entertainment" }],
  creator: "JT Entertainment",
  publisher: "JT Entertainment",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_ZW",
    url: "/",
    siteName: "Zim Excellence China",
    title: "Zim Excellence China 2027",
    description: "Celebrate Zimbabwean beauty, culture, achievement and leadership in China.",
    images: [{ url: "/hero-zimbabwe-china.png", width: 1200, height: 630, alt: "Zim Excellence China 2027" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Zim Excellence China 2027",
    description: "Zimbabwean excellence, achievement and culture celebrated in China.",
    images: ["/hero-zimbabwe-china.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 }
  }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Header />{children}<Analytics /><footer className="border-t border-white/10 mt-24">
    <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/40">
      <span>© 2027 ZIM EXCELLENCE · CHINA EDITION</span><span>BEAUTY · CULTURE · CONFIDENCE · LEADERSHIP · EXCELLENCE</span>
    </div></footer></body></html>;
}
