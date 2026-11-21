import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vote",
  description: "Vote for Miss Zimbabwe China contestants and explore published Zim Excellence Awards nominees.",
  alternates: { canonical: "/vote" },
  robots: { index: true, follow: true }
};

export default function VoteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
