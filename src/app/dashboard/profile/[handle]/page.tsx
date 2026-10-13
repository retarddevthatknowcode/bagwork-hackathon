import type { Metadata } from "next";

import { PublicProfileView } from "@/components/console/pages/public-profile-view";

export const metadata: Metadata = {
  title: "Bagworker profile",
  // Public *inside* the console, not on the open web: the whole console is signed-in only, and so
  // is this. No profile belongs in a search result.
  robots: { index: false, follow: false },
};

/**
 * `/dashboard/profile/[handle]` — another Bagworker's profile.
 *
 * The segment accepts a handle or a `Bagworker#number`; the API resolves both, and anything that
 * matches nobody gets the view's own not-found state rather than a framework 404, so a dead link
 * still has the way back to the leaderboard on it.
 *
 * Your own profile stays at `/dashboard/profile` (no segment), which is where the editable form —
 * including the payout wallet — lives. Visiting this route with your own handle works and simply
 * points you there.
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <PublicProfileView handle={handle} />;
}
