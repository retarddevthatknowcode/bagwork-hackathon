import { permanentRedirect } from "next/navigation";

/**
 * `/bags/<id>` — the old bag URL, kept alive as a permanent redirect.
 *
 * Every coin launched before this path moved carries `/bags/<id>` as its on-chain `website`, and
 * on-chain metadata cannot be edited — so those links can never be corrected at the source and have
 * to keep resolving for as long as the coins exist. This is the whole reason the route is still here.
 *
 * It redirects rather than rendering, because the bag already has a page: the console route tree at
 * `/dashboard/bags/<id>`, which is where the brief, the fee history and the claim and submit actions
 * live. A second, public copy would have to be kept in step with it, and would drift — and a visitor
 * arriving from a wallet should get the real bag, not a thinner one.
 *
 * `permanentRedirect` is a real HTTP 308, so wallets, explorers, link previewers and crawlers all
 * follow it, and the id is passed through untouched. Nothing is read from the database here: an id
 * that exists lands on the bag, and an id that does not lands on the same page's own "unavailable"
 * state, which is a better answer than a 404 from a link nobody can change.
 */
export default async function LegacyBagPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/dashboard/bags/${id}`);
}


