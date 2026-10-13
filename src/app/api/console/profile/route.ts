import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { parseCharacter } from "@/lib/profile/character";
import { levelFromPoints } from "@/lib/profile/points";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function weekStart(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/**
 * GET /api/console/profile — creator identity, level curve and derived stats.
 *
 * Previously this looked up a hardcoded `id: "current-user"`, so it answered **404 for
 * every caller** — the console sidebar always showed "@bagworker · Lv 1 · Trust 0/100"
 * and logged a 404 in the browser console on every page. It now resolves the verified
 * Privy session, so the figures are the signed-in creator's own.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  const user = session.user;

  const [submissions, payouts, board, ranked] = await Promise.all([
    db.submission.findMany({
      where: { userId: user.id },
      include: { campaign: { include: { project: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.payout.findMany({ where: { submission: { userId: user.id } } }),
    db.leaderboard.findFirst({ where: { userId: user.id } }),
    // How many Bagworkers are ranked at all — the "of N" in a rank badge. Fetched with the rest
    // rather than awaited afterwards: one statement is ~0.9s against the remote pooler, and
    // sequencing it here was adding a full second to the profile page for a single integer.
    db.leaderboard.count(),
  ]);

  const settled = submissions.filter((s) => s.status === "paid");
  const approved = submissions.filter(
    (s) => s.status === "paid" || s.status === "approved",
  );
  const inFlight = submissions.filter(
    (s) => s.status === "pending" || s.status === "reviewing",
  );
  const rejected = submissions.filter((s) => s.status === "rejected");

  /**
   * The console's level is the profile's level.
   *
   * Points are the only progression the product has (`lib/profile/points.ts`), so this must
   * not compute a second, different curve — when it did, the sidebar read "Lv 12" while the
   * profile page read "Level 2".
   */
  const { level, pointsIntoLevel, pointsToNextLevel, progress } = levelFromPoints(user.points);

  // consecutive weeks (incl. this one) with at least one submission
  const weeks = new Set(submissions.map((s) => weekStart(s.createdAt.getTime())));
  let streak = 0;
  for (let i = 0; i < 52; i++) {
    const key = weekStart(Date.now()) - i * 7 * 86_400_000;
    if (weeks.has(key)) streak++;
    else if (i > 0) break;
  }

  // platform mix — what actually earns for this creator
  const platforms = ["x", "tiktok", "instagram", "youtube"].map((platform) => {
    const rows = submissions.filter((s) => s.platform === platform);
    const earned = rows
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + (s.payoutAmount ?? 0), 0);
    return {
      platform,
      posts: rows.length,
      earned: Math.round(earned * 100) / 100,
      views: rows.reduce((sum, s) => sum + s.views, 0),
    };
  });

  const totalViews = submissions.reduce((s, x) => s + x.views, 0);
  const totalLikes = submissions.reduce((s, x) => s + x.likes, 0);

  const weekly = Array.from({ length: 12 }, (_, i) => {
    const start = weekStart(Date.now()) - (11 - i) * 7 * 86_400_000;
    const end = start + 7 * 86_400_000;
    const rows = submissions.filter(
      (s) => s.createdAt.getTime() >= start && s.createdAt.getTime() < end,
    );
    return {
      label: new Date(start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      submissions: rows.length,
      earned:
        Math.round(
          rows
            .filter((s) => s.status === "paid")
            .reduce((sum, s) => sum + (s.payoutAmount ?? 0), 0) * 100,
        ) / 100,
    };
  });

  return NextResponse.json({
    user: {
      id: user.id,
      handle: user.handle,
      walletAddress: user.walletAddress,
      avatarColor: user.avatarColor,
      avatarId: user.avatarId,
      character: parseCharacter(user.character),
      /** The permanent `Bagworker#3578` identity. */
      profileNumber: user.profileNumber,
      trustScore: user.trustScore,
      totalEarned: user.totalEarned,
      joinedAt: user.createdAt.toISOString(),
      /** Real progression: 33 points per $1 of settled earnings, floored. */
      points: user.points,
      level,
      pointsIntoLevel,
      pointsToNextLevel,
      levelProgress: Math.round(progress * 100),
      rank: board?.rank ?? null,
      badge: board?.badge ?? null,
      rankOf: ranked || 1,
    },
    stats: {
      submissions: submissions.length,
      settled: settled.length,
      approved: approved.length,
      rejected: rejected.length,
      inFlight: inFlight.length,
      approvalRate: submissions.length
        ? Math.round((approved.length / submissions.length) * 100)
        : 0,
      streak,
      totalViews,
      totalLikes,
      engagementRate: totalViews
        ? Math.round((totalLikes / totalViews) * 1000) / 10
        : 0,
      avgQuality: submissions.length
        ? Math.round(
            submissions.reduce((s, x) => s + x.qualityScore, 0) / submissions.length,
          )
        : 0,
      avgAuthenticity: submissions.length
        ? Math.round(
            submissions.reduce((s, x) => s + x.authenticityScore, 0) / submissions.length,
          )
        : 0,
      paidCount: payouts.length,
      bestPayout: payouts.length ? Math.max(...payouts.map((p) => p.amount)) : 0,
    },
    platforms,
    weekly,
  }, { headers: NO_STORE });
}
