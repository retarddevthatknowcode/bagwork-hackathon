import type { Metadata } from "next";

import { DocsContent } from "@/components/docs/docs-content";
import { OPEN_GRAPH_DEFAULTS } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/docs" },
  // Spread, not written out: setting `openGraph` replaces the layout's block rather than merging,
  // so a page that only sets `url` loses the image and the site name from its own card.
  openGraph: {
    ...OPEN_GRAPH_DEFAULTS,
    url: "/docs",
    title: "Docs — Bagwork",
    description:
      "How Bagwork works: fixed Bags and Flywheel campaigns, the 5% fee split, anti-slop review and on-chain USDC payouts.",
  },
  title: "Docs — Bagwork",
  description:
    "How Bagwork works: fixed Bags and Flywheel campaigns, the 5% fee split, anti-slop review and on-chain USDC payouts.",
};

/**
 * The docs.
 *
 * The chrome — sidebar, sticky header, off-canvas drawer, right-hand TOC — comes from the segment
 * layout (`./layout.tsx`), which is the only place Fumadocs is wired in. This file is just the
 * document, and it is a server component, so all twelve sections are in the initial HTML: readable
 * without JavaScript, linkable by anchor, and indexable.
 *
 * Content lives in one component per section rather than in a `paragraphs`/`list`/`diagram` data
 * array. The old version forced every section through that one template, which is why fourteen
 * quite different topics all rendered as the same card — and why there was nowhere to put a Steps
 * list, a pair of cards, or a warning about something that is not live yet.
 */
export default function DocsPage() {
  return <DocsContent />;
}
