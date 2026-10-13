import type { Metadata } from "next";

import { LegalPage } from "@/components/site/legal-page";
import { TERMS } from "@/lib/legal";
import { OPEN_GRAPH_DEFAULTS } from "@/lib/site";

const DESCRIPTION =
  "The agreement for using Bagwork: content campaigns, wallet connections, submissions and review, on-chain USDC payouts, and the limits of what we promise.";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  // Spread rather than written out: setting `openGraph` replaces the layout's block instead of
  // merging, so a page that only set `url` would drop the image and site name off its own card.
  openGraph: {
    ...OPEN_GRAPH_DEFAULTS,
    url: "/terms",
    title: "Terms of Service — Bagwork",
    description: DESCRIPTION,
  },
  title: "Terms of Service — Bagwork",
  description: DESCRIPTION,
};

export default function TermsPage() {
  return <LegalPage document={TERMS} />;
}
