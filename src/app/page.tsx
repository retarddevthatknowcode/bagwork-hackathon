import type { Metadata } from "next";

import { MarketingPage } from "@/components/site/marketing-page";
import { OPEN_GRAPH_DEFAULTS } from "@/lib/site";

/**
 * The homepage, as a Server Component.
 *
 * Its only job is metadata. `/` is the one page whose canonical URL *is* the site root, so it
 * declares that here — resolved against `metadataBase` in the root layout — and lets the
 * interactive half live in `MarketingPage`. Title and description are inherited from the root
 * layout, where the brand-level copy belongs.
 *
 * `openGraph` is spread from `OPEN_GRAPH_DEFAULTS` rather than written out, because setting it
 * replaces the layout's block outright instead of merging into it.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OPEN_GRAPH_DEFAULTS, url: "/" },
};

export default function Home() {
  return <MarketingPage />;
}
