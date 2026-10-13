/**
 * Gives every profile that has no points yet a random lifetime total, so the leaderboard has
 * something to rank.
 *
 * Run with:  bun run db:seed:points          (only accounts still on 0 points)
 *            bun run db:seed:points --force  (re-roll everyone)
 *
 * What it does, and what it deliberately does not:
 *
 *   - Points first, level derived. The level comes from `levelFromPoints`, never picked
 *     separately, so a profile cannot show a level its points do not justify.
 *   - `totalEarned` is derived as `points / 33` — the app's own rate, `POINTS_PER_DOLLAR` —
 *     because the two boards read different fields: the console ranks points, the marketing
 *     board shows dollars. Deriving one from the other keeps the same person in the same
 *     order on both, instead of one of the two reading $0 for everybody.
 *   - Idempotent by default: only accounts whose `points` are still 0 are touched, so running
 *     it again after a real payout has been credited cannot rewrite real history. `--force`
 *     is the explicit "yes, overwrite the numbers" switch.
 *   - Not part of the app. `lib/profile/rewards.ts` is the only module in `src` allowed to
 *     move points; this script writes them directly because it has to be idempotent and there
 *     is no award path to hang a synthetic credit off. Nothing in the request cycle can reach
 *     it — it is a one-shot seeding tool run by hand.
 *   - It ends by calling `recomputeLeaderboard()`, so the denormalised board (the marketing
 *     page and `/api/stats`) picks the new totals up in the same run rather than on the next
 *     payout.
 */
import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { levelFromPoints, POINTS_PER_DOLLAR } from "@/lib/profile/points";
import { recomputeLeaderboard } from "@/lib/leaderboard";

const db = new PrismaClient();

/**
 * Wide enough to land accounts on different levels — Level 2 starts at 5,000 points, Level 3
 * at 25,000 — without inventing anybody at the top of the ladder, which would take 200,000.
 */
const MIN_POINTS = 1_000;
const MAX_POINTS = 45_000;

const force = process.argv.includes("--force");

function label(user: {
  handle: string | null;
  displayName: string | null;
  walletAddress: string | null;
  id: string;
}) {
  return user.handle ?? user.displayName ?? user.walletAddress?.slice(0, 8) ?? `…${user.id.slice(-6)}`;
}

async function main() {
  const targets = await db.user.findMany({
    where: force ? {} : { points: 0 },
    select: {
      id: true,
      handle: true,
      displayName: true,
      walletAddress: true,
      points: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (targets.length === 0) {
    console.log(
      "Nothing to seed: every profile already has points. Pass --force to re-roll them."
    );
  }

  const seeded: { who: string; total: number; added: number; level: number; earned: number }[] = [];

  for (const user of targets) {
    const added = randomInt(MIN_POINTS, MAX_POINTS + 1);
    const total = force ? added : user.points + added;
    const earned = Math.round((total / POINTS_PER_DOLLAR) * 100) / 100;
    const level = levelFromPoints(total).level;

    await db.user.update({
      where: { id: user.id },
      data: force
        ? { points: total, totalEarned: earned, level }
        : {
            // Increments, not assignments: the script must never look like a way to take
            // points away, and this is the same shape `creditPoints` uses.
            points: { increment: added },
            totalEarned: { increment: earned },
            level,
          },
    });

    seeded.push({ who: label(user), total, added, level, earned });
  }

  const ranked = await recomputeLeaderboard();

  console.log(
    `seeded ${seeded.length} profile(s); leaderboard rebuilt with ${ranked} ranked row(s)`
  );
  for (const row of seeded) {
    console.log(
      `  ${row.who.padEnd(16)} +${String(row.added).padStart(6)} pts → ${String(row.total).padStart(6)} (level ${row.level}, $${row.earned.toFixed(2)})`
    );
  }

  const board = await db.leaderboard.findMany({ orderBy: { rank: "asc" }, take: 10 });
  console.log("board:");
  for (const entry of board) {
    console.log(
      `  #${entry.rank} ${entry.handle.padEnd(16)} ${(entry.badge ?? "—").padEnd(9)} $${entry.totalEarned.toFixed(2).padStart(9)}  trust ${entry.trustScore}`
    );
  }
}

main()
  .catch((error) => {
    console.error("seeding failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
