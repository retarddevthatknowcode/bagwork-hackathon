import type { Metadata } from "next";

import { LegalPage } from "@/components/site/legal-page";
import { PRIVACY } from "@/lib/legal";
import { OPEN_GRAPH_DEFAULTS } from "@/lib/site";

const DESCRIPTION =
  "What Bagwork collects, why we collect it, what is public on a creator's record, how wallet addresses are used, and the choices you have.";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  openGraph: {
    ...OPEN_GRAPH_DEFAULTS,
    url: "/privacy",
    title: "Privacy Policy — Bagwork",
    description: DESCRIPTION,
  },
  title: "Privacy Policy — Bagwork",
  description: DESCRIPTION,
};

export default function PrivacyPage() {
  return <LegalPage document={PRIVACY} />;
}
