import type { Metadata } from "next";

/**
 * The site's canonical identity, in one place.
 *
 * Every absolute URL the app publishes — the `metadataBase` that canonical and Open Graph tags
 * resolve against, the sitemap and `robots.txt` — reads from here. Before this module existed the
 * app had no site URL at all: `metadataBase` was unset, so canonical and Open Graph URLs were
 * emitted relative and each crawler resolved them against whatever host it happened to use. That
 * is invisible until a link is shared and the preview points at the wrong place.
 *
 * Resolution order:
 *
 *   1. `NEXT_PUBLIC_SITE_URL` — the explicit override, and the one knob worth setting by hand.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — set by Vercel on every deployment to the project's
 *      production domain. Reading it means a rename, or a second custom domain, needs no code
 *      change and no environment variable to remember.
 *   3. `https://bag-work.fun` — so `next dev`, a test run and a bare Node script all still produce
 *      correct absolute URLs without any configuration.
 */

/** The production domain this deployment is served from. */
const DEFAULT_SITE_URL = "https://bag-work.fun";

/**
 * Accepts what each source actually provides: `VERCEL_PROJECT_PRODUCTION_URL` is a bare host
 * (`bag-work.fun`), while `NEXT_PUBLIC_SITE_URL` is usually written with a scheme and often with a
 * trailing slash. Normalising here keeps every caller from having to care.
 */
function normalise(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Canonical origin, no trailing slash. */
export const SITE_URL =
  normalise(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalise(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  DEFAULT_SITE_URL;

/** How the site names itself in titles and Open Graph. */
export const SITE_NAME = "BAGWORK";

/**
 * Bagwork's own X account.
 *
 * Single-sourced because a launched coin's metadata defaults its X link to this, and the console and
 * the site footer point at it too. A default that named a stale handle would put a dead link into
 * every wallet and terminal that reads the coin's metadata — where it cannot be corrected.
 */
export const SITE_X_URL = "https://x.com/itsbagwork";

/** The tagline used as the default description. */
export const SITE_DESCRIPTION =
  "Create content. Get paid. The on-chain content rewards marketplace for Solana. Projects fund campaigns, creators post, get reviewed, and earn instant on-chain payouts.";

/**
 * Turns a path into the absolute URL a crawler should see.
 *
 * `absoluteUrl("/")` → `https://bag-work.fun/`. Used by the sitemap; metadata can pass relative
 * paths directly because `metadataBase` resolves them.
 */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

/**
 * True when a URL is something a wallet, explorer or trading terminal can actually fetch.
 *
 * The image in a coin's metadata is not decoration: it is the coin's face in every wallet and on
 * pump, and it is written into a document that is immutable once the coin exists. A relative path
 * would be resolved by whoever fetched the JSON — not by us — and a `localhost` or `.local` host is
 * unreachable from anywhere but the machine that wrote it. Both failures look identical to the
 * launcher: a coin with no picture, forever.
 *
 * HTTPS only, because the fetchers are not browsers on our origin and some refuse plain HTTP.
 *
 * Lives here rather than beside the metadata builder so the **form and the server can use the same
 * function**. They must: a client that judged an upload by a laxer rule than the server would clear
 * its own blocker, let someone press launch, and then have the request refused for a reason the form
 * had already decided was fine — which is exactly the bug this moved to fix.
 */
export function isFetchableImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * The public page for one bag — the URL a launched coin carries as its `website`.
 *
 * It points at the **dashboard** bag page (`/dashboard/bags/<id>`) rather than a separate public
 * URL, because that is where a bag actually is: the brief, the fee history, and the claim and submit
 * actions all live there, and a coin's website should take someone to the real thing rather than to a
 * second, thinner copy of it that has to be kept in step. Viewing it does not require signing in —
 * signing in is only asked for when someone acts on the bag.
 *
 * Built from the campaign **id** and nothing else. A ticker cannot serve here: `$PROBE` is not
 * unique, so a coin whose metadata pointed at a ticker would send every wallet and explorer that
 * read it to whichever bag happened to match — possibly someone else's, possibly several. The id is
 * unique by construction and stable for the life of the bag, which is what an on-chain, uneditable
 * field needs.
 *
 * Absolute on purpose: this string is written into a JSON document that wallets fetch from somewhere
 * else entirely, where a relative path resolves against the wrong host.
 *
 * Note for the older coins: `/bags/<id>` was this URL until it was moved here, and those links are
 * already on-chain and cannot be changed. `src/app/bags/[id]/page.tsx` keeps them working with a
 * permanent redirect to the same id under this path.
 */
export function campaignPageUrl(campaignId: string): string {
  return absoluteUrl(`/dashboard/bags/${encodeURIComponent(campaignId)}`);
}

/**
 * The Open Graph block every page starts from.
 *
 * Pages spread this rather than declaring `openGraph` from scratch, because Next **replaces** the
 * whole `openGraph` object when a route sets one — it does not merge field by field. A page that
 * only wanted its own `url` therefore dropped the image, the site name and the type off its own
 * card, which is exactly what happened the first time this was written. Spreading keeps the card
 * complete and still lets a page override the URL or the title.
 *
 * The image is a relative path on purpose: `metadataBase` in the root layout resolves it to an
 * absolute URL on the deployment's own domain.
 */
export const OPEN_GRAPH_DEFAULTS = {
  type: "website",
  siteName: SITE_NAME,
  title: "BAGWORK — Get Paid to Create",
  description: "Create content. Get paid. On-chain content rewards marketplace.",
  images: [{ url: "/bagwork-logo.png", alt: SITE_NAME }],
} satisfies NonNullable<Metadata["openGraph"]>;
