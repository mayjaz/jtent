import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Event Tickets",
  description: "Buy General Admission or VIP tickets for Zim Excellence China Edition 2027 at BaiFuYi Hotel in Beijing on 23 January 2027.",
  alternates: { canonical: "/tickets" }
};

export default function TicketsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
