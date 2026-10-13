/**
 * Rotating tip lines for the console top bar.
 *
 * These are *suggestions*, deliberately not metrics. The bar used to cycle live figures
 * ("$9,100 still up for grabs", "3 settled so far"), which read as a status readout and
 * duplicated what the page below already showed. A tip line tells you what you can do
 * next instead, and it matches the page you are actually on.
 */

/** Per-page tips, matched longest-prefix-first. */
const PAGE_TIPS: { prefix: string; tips: string[] }[] = [
  {
    prefix: "/dashboard/submissions",
    tips: [
      "Set a reminder to post — most bags pay out fastest in the first 48 hours",
      "Keep your post up until it has been reviewed to protect your trust score",
      "One strong post beats five rushed ones — quality is scored, not counted",
    ],
  },
  {
    prefix: "/dashboard/earnings",
    tips: [
      "Payouts land straight in your payout wallet — nothing to withdraw",
      "Copy your payout wallet any time from this page or the top-right menu",
      "Higher trust score means access to better-paying bags",
    ],
  },
  {
    prefix: "/dashboard/my-bags",
    tips: [
      "Bags with a clear brief get three times the submissions",
      "Top up a bag before it runs dry so creators keep posting",
      "Review quickly — creators skip projects that sit in review",
    ],
  },
  {
    prefix: "/dashboard/create",
    tips: [
      "Being specific about the brief is the cheapest way to get good content",
      "Every bag holds the budget in escrow until a post is approved",
      "Set a per-post max to keep costs predictable",
    ],
  },
  {
    prefix: "/dashboard/profile",
    tips: [
      "A finished profile wins more invitations from projects",
      "Pick an avatar — projects see it next to your submissions",
      "Link every platform you post on so verification is one step",
    ],
  },
  {
    prefix: "/dashboard/settings",
    tips: [
      "Keep your payout wallet accurate — payouts are non-reversible",
      "Signed out on a new device? The same wallet brings everything back",
    ],
  },
  {
    prefix: "/dashboard/bags",
    tips: [
      "Read the brief before claiming — rejected posts cost trust score",
      "Claim a slot first, then post when you are ready",
      "Fee-redirect bags refill themselves from trading fees",
    ],
  },
  {
    prefix: "/dashboard",
    tips: [
      "Bagwork — claim a bag, post your content, get paid",
      "Browse open bags and pick one that matches your audience",
      "Creators are paid in USDC the moment a post is approved",
      "New here? Finish your profile to unlock every bag",
    ],
  },
];

/** Shown before the pathname is known, and as a fallback. */
const FALLBACK_TIPS = [
  "Bagwork — claim a bag, post your content, get paid",
  "Browse open bags and pick one that matches your audience",
  "Creators are paid in USDC the moment a post is approved",
];

/**
 * Pick the tip set for a pathname.
 *
 * Longest prefix wins, so `/dashboard/bags/123` prefers the bag tips over the console
 * root's. Returning a fresh array keeps the caller's `useMemo` dependency honest.
 */
export function tipsForPath(pathname: string | null): string[] {
  if (!pathname) return FALLBACK_TIPS;

  const match = PAGE_TIPS.filter(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return match?.tips ?? FALLBACK_TIPS;
}
