import type { Metadata } from "next";

import { TokenAnalyticsPage } from "@/components/console/pages/token-analytics";
import { TOKEN_IDENTITY, getTokenAnalytics } from "@/lib/token/analytics";

/**
 * Token Analytics — `/dashboard/token`.
 *
 * A server component on purpose. `getTokenAnalytics` reads `BAG_TOKEN_MINT`, which is a
 * server-only variable, and the page must re-read it per request: prerendering this route would
 * bake in whatever the mint happened to be at build time, so setting it after a deploy would
 * leave the page in "Launching Soon" mode until the next build. Dynamic rendering is what makes
 * the launch procedure exactly one environment variable.
 *
 * Everything the client component needs is a plain object, so no provider code or key can travel
 * with it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Token Analytics | Bagwork Console",
  description: `Market, buyback and burn analytics for $${TOKEN_IDENTITY.symbol} — the fee loop that buys the token back and burns it.`,
};

export default async function TokenRoute() {
  const token = await getTokenAnalytics();
  return <TokenAnalyticsPage token={token} />;
}
