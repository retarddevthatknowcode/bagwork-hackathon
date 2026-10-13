/**
 * The link to a Bagworker's public profile.
 *
 * One function, because three surfaces produce this URL (leaderboard rows, the podium, and the
 * profile page's own canonical redirect) and a handle-less account still has to resolve: every
 * Bagworker has a permanent number, so `Bagworker#3578` is a valid link where a handle would be
 * missing. The endpoint accepts either spelling, so this only has to pick the friendlier one.
 *
 * Client-safe on purpose — no database import — so a list row can call it.
 */
export function bagworkerHref(user: {
  handle?: string | null;
  profileNumber?: number | null;
}): string {
  const identifier = user.handle?.trim() || (user.profileNumber != null ? String(user.profileNumber) : "");
  return `/dashboard/profile/${encodeURIComponent(identifier)}`;
}
