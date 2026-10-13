import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  CONSOLE_LEADERBOARD_LIMIT,
  leaderboardWindowStart,
  type LeaderboardRange,
} from "@/lib/leaderboard-ranges";
import { POINTS_PER_DOLLAR } from "@/lib/profile/points";

/**
 * Recomputes the denormalised `leaderboards` table.
 *
 * Nothing ever wrote to it, so the public leaderboard screen (linked from the marketing
 * nav as "BAGWORKERS") was permanently empty and `GET /api/stats` always reported
 * `trustAvg: 0`. This rebuilds it from the authoritative rows — users, submissions and
 * their earnings mirror — and is called whenever earnings, points or a review verdict
 * change.
 *
 * Ranked on **lifetime points**, which is the same ordering (and the same tiebreaks) the
 * console board uses for `range=overall` in `rankedLeaderboard` below: two boards that
 * disagree about who is first are worse than one board. It used to require at least one
 * settled payout, which left the table empty for every account that has earned points
 * without being paid out yet — including everything seeded by `scripts/seed-demo-points.ts`.
 *
 * `totalEarned` comes from `User.totalEarned`, the mirror `lib/profile/rewards.ts` moves in
 * the same transaction as the points it credits, rather than from summing `Payout` rows.
 * Both agree once money moves, and the mirror is the only one of the two that knows about
 * earnings credited before the payout flow existed.
 *
 * Full rebuild inside one transaction rather than incremental upserts: the set of ranks
 * is global (one creator's new payout renumbers everyone below them), the dataset is
 * small, and a rebuild is idempotent — the table can never drift from the source rows.
 */
export async function recomputeLeaderboard(): Promise<number> {
  const users = await db.user.findMany({
    select: {
      id: true,
      handle: true,
      walletAddress: true,
      trustScore: true,
      totalEarned: true,
      points: true,
      createdAt: true,
      // `submissions` on the model is an Int counter; the relation is `submissionsRel`.
      submissionsRel: { select: { status: true } },
    },
  });

  const ranked = users
    .map((user) => {
      const approvals = user.submissionsRel.filter(
        (s) => s.status === "approved" || s.status === "paid",
      ).length;
      return {
        userId: user.id,
        handle: user.handle ?? (user.walletAddress ? user.walletAddress.slice(0, 4) : "anon"),
        wallet: user.walletAddress ?? "",
        trustScore: user.trustScore,
        totalEarned: Math.round(user.totalEarned * 100) / 100,
        submissions: user.submissionsRel.length,
        approvalRate: user.submissionsRel.length
          ? Math.round((approvals / user.submissionsRel.length) * 100)
          : 0,
        points: user.points,
        earned: user.totalEarned,
        joinedAt: user.createdAt.getTime(),
      };
    })
    .filter((row) => row.points > 0)
    // Same order and the same tiebreaks as `rankedLeaderboard`'s `overall` branch — points,
    // then earnings, then the older account, then the id. Ties that resolved differently here
    // and there would be two boards disagreeing about who is ahead.
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.earned - a.earned ||
        a.joinedAt - b.joinedAt ||
        (a.userId < b.userId ? -1 : 1),
    )
    .map((row, index) => ({
      userId: row.userId,
      handle: row.handle,
      wallet: row.wallet,
      trustScore: row.trustScore,
      totalEarned: row.totalEarned,
      submissions: row.submissions,
      approvalRate: row.approvalRate,
      badge: badgeFor(index + 1),
      rank: index + 1,
    }));

  await db.$transaction([
    db.leaderboard.deleteMany({}),
    ...(ranked.length
      ? [db.leaderboard.createMany({ data: ranked })]
      : []),
  ]);

  return ranked.length;
}

/** Tier by position — mirrors the badges the leaderboard UI renders. */
function badgeFor(rank: number): string {
  if (rank <= 3) return "DIAMOND";
  if (rank <= 6) return "PLATINUM";
  if (rank <= 10) return "GOLD";
  if (rank <= 25) return "SILVER";
  return "BRONZE";
}

/* ==========================================================================
   Console leaderboard — ranked purely on Points
   ==========================================================================

   A separate reader from the denormalised table above, and deliberately so:

     - the table above ranks by *earnings* and carries no points at all;
     - it has no time dimension, so Daily / Weekly / Monthly cannot be expressed;
     - it holds no identity (`character`, `profileNumber`), which the board's cards
       and rows need in order to draw a real Bagworker.

   Rankings are Points and nothing else. For `overall` that is the stored
   `User.points` total (lifetime, never decreases). For a window it is the points earned
   inside that window, summed from the only two things that can earn any: the payouts that
   settled in it (using the identical `pointsForEarnings` arithmetic `creditPayoutRewards`
   applies) and the weekly quest completions inside it (`UserQuest.pointsAwarded`). Quest
   points belong on the board — they land in `User.points`, so a board that ignored them
   would publish a weekly total that contradicted the lifetime one.

   The range vocabulary itself lives in `lib/leaderboard-ranges.ts` so the client board can
   import it without pulling this file's Prisma client into the browser bundle.
   ========================================================================== */

export interface RankedCreator {
  rank: number;
  userId: string;
  handle: string | null;
  displayName: string | null;
  profileNumber: number | null;
  /** Raw JSON column — the API parses it into a `CharacterConfig`. */
  character: Prisma.JsonValue | null;
  avatarId: string | null;
  /** Points earned inside the window (lifetime points when the range is `overall`). */
  points: number;
  /** USDC settled inside the window. */
  earned: number;
  /** Payouts settled inside the window. */
  settled: number;
  /** Weekly quests completed inside the window (lifetime when the range is `overall`). */
  quests: number;
  /** The profile's level — always derived from *lifetime* points, never the window's. */
  level: number;
  lifetimePoints: number;
  /** True for the signed-in viewer's own row, so the board can point them out. */
  isYou: boolean;
}

/** Identity + progression columns every row needs, fetched in one query. */
const RANKED_USER_FIELDS = {
  id: true,
  handle: true,
  displayName: true,
  profileNumber: true,
  character: true,
  avatarId: true,
  level: true,
  points: true,
  totalEarned: true,
  _count: { select: { payouts: true } },
  /** Completed weeks only — in-progress quest rows carry no points and are not counted. */
  questProgress: { where: { status: "completed" }, select: { id: true } },
} satisfies Prisma.UserSelect;

interface WindowAggregate {
  userId: string;
  points: number;
  earned: number;
  settled: number;
  quests: number;
}

/**
 * Points per creator inside one window, aggregated by Postgres.
 *
 * `GROUP BY` / `ORDER BY` / `HAVING` in SQL rather than pulling rows into Node: the result set
 * is one row per earner instead of one row per payout, and the sort happens where the index is
 * (`payouts` is indexed on `created_at`, `user_quests` on `period_key`). The payout expression is
 * the same floor the ledger uses, so a $0.02 payout cannot round its way onto the board.
 *
 * Two sources, one number. Payouts and weekly quest completions are unioned and then summed, in
 * a single statement rather than two round trips reconciled in JavaScript. `completed_at` — not
 * `updated_at` — decides which week a quest belongs to, so re-reading a quest row cannot move its
 * points into a later week.
 */
async function windowAggregate(since: Date): Promise<WindowAggregate[]> {
  return db.$queryRaw<WindowAggregate[]>`
    WITH settled AS (
      SELECT
        "user_id" AS user_id,
        SUM(FLOOR("amount" * ${POINTS_PER_DOLLAR}::float8))::int AS points,
        COALESCE(SUM("amount"), 0)::float8 AS earned,
        COUNT(*)::int AS settled,
        0::int AS quests
      FROM "payouts"
      WHERE "user_id" IS NOT NULL AND "created_at" >= ${since}
      GROUP BY "user_id"
    ),
    completed_quests AS (
      SELECT
        "user_id" AS user_id,
        SUM("points_awarded")::int AS points,
        0::float8 AS earned,
        0::int AS settled,
        COUNT(*)::int AS quests
      FROM "user_quests"
      WHERE "user_id" IS NOT NULL
        AND "completed_at" >= ${since}
        AND "points_awarded" > 0
      GROUP BY "user_id"
    )
    SELECT
      earned."user_id" AS "userId",
      SUM(earned.points)::int AS "points",
      SUM(earned.earned)::float8 AS "earned",
      SUM(earned.settled)::int AS "settled",
      SUM(earned.quests)::int AS "quests"
    FROM (
      SELECT user_id, points, earned, settled, quests FROM settled
      UNION ALL
      SELECT user_id, points, earned, settled, quests FROM completed_quests
    ) AS earned
    GROUP BY earned."user_id"
    HAVING SUM(earned.points) > 0
    ORDER BY "points" DESC, "earned" DESC, "userId" ASC
  `;
}

/**
 * The board for one range.
 *
 * At most two round trips: one to work out who is ranked and on what, one to fetch their
 * identities. No per-row queries, and nothing is pulled into the process that the ranking
 * does not need.
 */
export async function rankedLeaderboard(
  range: LeaderboardRange,
  viewerId: string | null,
): Promise<{ entries: RankedCreator[]; total: number }> {
  if (range === "overall") {
    // Lifetime points are stored per user, so this is an indexed read; the count runs
    // alongside it rather than after it.
    const [users, total] = await Promise.all([
      db.user.findMany({
        // No `points > 0` filter: the whole userbase is ranked, so a brand-new account is a real
        // row at 0 points rather than missing. Filtering here is what left a small userbase with a
        // podium and nothing underneath it.
        orderBy: [
          { points: "desc" },
          { totalEarned: "desc" },
          // Ties are broken deterministically so the board cannot reshuffle between refreshes.
          { createdAt: "asc" },
          { id: "asc" },
        ],
        take: CONSOLE_LEADERBOARD_LIMIT,
        select: RANKED_USER_FIELDS,
      }),
      db.user.count(),
    ]);

    return {
      total,
      entries: users.map((user, index) => ({
        rank: index + 1,
        userId: user.id,
        handle: user.handle,
        displayName: user.displayName,
        profileNumber: user.profileNumber,
        character: user.character,
        avatarId: user.avatarId,
        points: user.points,
        earned: Math.round(user.totalEarned * 100) / 100,
        settled: user._count.payouts,
        quests: user.questProgress.length,
        level: user.level,
        lifetimePoints: user.points,
        isYou: user.id === viewerId,
      })),
    };
  }

  const since = leaderboardWindowStart(range);
  const aggregated = since ? await windowAggregate(since) : [];

  // Every ranked creator is counted, so `total` is the real size of the board even when the
  // list itself is capped.
  const total = aggregated.length;
  const windowed = aggregated.slice(0, CONSOLE_LEADERBOARD_LIMIT);
  if (windowed.length === 0) return { entries: [], total: 0 };

  const users = await db.user.findMany({
    where: { id: { in: windowed.map((row) => row.userId) } },
    select: RANKED_USER_FIELDS,
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  const entries: RankedCreator[] = [];
  for (const row of windowed) {
    const user = byId.get(row.userId);
    // `Payout.userId` is `onDelete: SetNull`, so a settled payout can outlive its account.
    // Such a row has no identity to draw, so it is skipped rather than shown blank.
    if (!user) continue;
    entries.push({
      rank: entries.length + 1,
      userId: user.id,
      handle: user.handle,
      displayName: user.displayName,
      profileNumber: user.profileNumber,
      character: user.character,
      avatarId: user.avatarId,
      points: row.points,
      earned: Math.round(row.earned * 100) / 100,
      settled: row.settled,
      quests: row.quests,
      // Level is a lifetime tier — a big week does not invent a level.
      level: user.level,
      lifetimePoints: user.points,
      isYou: user.id === viewerId,
    });
  }

  return { entries, total };
}
