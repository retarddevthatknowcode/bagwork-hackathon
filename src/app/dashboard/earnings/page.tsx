import type { Metadata } from "next";
import { Earnings } from "@/components/console/pages/earnings-page";

export const metadata: Metadata = {
  title: "Earnings & Payouts | Bagwork Console",
  description: "Track on-chain USDC settlements, payouts history, and export records.",
};

export default function EarningsRoute() {
  return <Earnings />;
}
