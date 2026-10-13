import type { Metadata } from "next";
import { ConsoleShell } from "@/components/console/shell";

export const metadata: Metadata = {
  // The console is a signed-in product surface: nothing here belongs in a search result, and the
  // same applies to every route beneath it.
  robots: { index: false, follow: false },
  title: {
    default: "Creator Console — Bagwork",
    template: "%s — Bagwork",
  },
  description:
    "The Bagwork creator console: discover funded bags, track submissions, claim USDC payouts and grow your trust score.",
};

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
