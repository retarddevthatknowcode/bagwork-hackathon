/**
 * Crediting real work — server only.
 *
 * This is the *only* module that writes `User.points` and `User.level`, and it offers exactly
 * two ways in. Everything the points system claims (see `./points.ts`) depends on that holding:
 *
 *   - `creditPayoutRewards` — called from the places a `Payout` row is created, i.e. for money
 *     that actually moved on-chain;
 *   - `awardQuestReward`   — called when a weekly quest is completed, and only after the quest
 *     engine has verified that progress from real rows.
 *
 * Nothing else — approval, rejection, a pending submission, a manual adjustment, a future admin
 * tool — touches the columns.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { levelFromPoints, pointsForEarnings } from "./points";

export interface PointsAward {
  /** Points this credit added. */
  awarded: number;
  /** Lifetime points after the award. */
  points: number;
  /** Level after the award. */
  level: number;
}

/** Kept as an alias so payout callers can keep speaking the name they already use. */
export type PayoutReward = PointsAward;

/**
 * Adds points and re-derives the level, inside the caller's transaction.
 *
 * The single piece of arithmetic that moves a profile forward. `points` moves with `increment`
 * rather than a computed `set`, so two awards landing at the same moment add to each other
 * instead of overwriting — which is what "points never decrease" requires. The level is written
 * in the same transaction, so a reader never sees points from one level and a level from another.
 */
export async function creditPoints(
  tx: Prisma.TransactionClient,
  userId: string,
  awarded: number,
): Promise<PointsAward> {
  const bumped = await tx.user.update({
    where: { id: userId },
    data: { points: { increment: awarded } },
    select: { points: true, level: true },
  });

  const level = levelFromPoints(bumped.points).level;

  // Level is derived, and stored only so lists can sort on it.
  if (level !== bumped.level) {
    await tx.user.update({ where: { id: userId }, data: { level } });
  }

  return { awarded, points: bumped.points, level };
}

/**
 * Credits `amount` of approved earnings to `userId`, plus the counters that come with a settled
 * payout (lifetime earnings, approvals, trust).
 *
 * One transaction, so none of those can disagree with each other.
 */
export async function creditPayoutRewards(
  userId: string,
  amount: number,
): Promise<PayoutReward> {
  const awarded = pointsForEarnings(amount);

  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        totalEarned: { increment: amount },
        approvals: { increment: 1 },
        trustScore: { increment: 1 },
      },
    });

    return creditPoints(tx, userId, awarded);
  });
}

/**
 * `creditPayoutRewards`, made non-fatal for payout routes.
 *
 * The payout row is the record that money moved; it is already written by the time this
 * runs. Throwing here would tell the operator the payment failed when it did not, so a
 * failure is reported and swallowed. `payouts.amount` remains the source of truth, so a
 * missed award is recoverable by replaying it.
 */
export async function creditPayoutRewardsSafely(
  userId: string | null | undefined,
  amount: number,
  context: string,
): Promise<PayoutReward | null> {
  if (!userId || amount <= 0) return null;
  try {
    return await creditPayoutRewards(userId, amount);
  } catch (error) {
    console.error(`[points] failed to credit ${context}`, {
      userId,
      amount,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Pays a completed weekly quest, **exactly once**.
 *
 * The claim is the `updateMany` below: it only matches while `points_awarded` is still `0`, and
 * Postgres makes that check and the write atomic. Two requests completing the same quest at the
 * same instant — the quests page refreshing while a review lands, say — therefore credit one
 * award between them, not two.
 *
 * The claim and the credit share a transaction, so a failure rolls the marker back and the next
 * sync retries it rather than silently keeping the points. `status` is set by the quest engine
 * before this runs, which is what makes `completed` + `pointsAwarded = 0` the one recoverable
 * state in the system.
 *
 * Returns `null` when there was nothing to pay — the normal "already awarded" path.
 */
export async function awardQuestReward(input: {
  userId: string;
  /** The `UserQuest` row for this user, quest and week. */
  userQuestId: string;
  /** Points the quest pays, read from the quest row. */
  reward: number;
  context: string;
}): Promise<PointsAward | null> {
  const { userId, userQuestId, reward, context } = input;
  if (reward <= 0) return null;

  try {
    return await db.$transaction(async (tx) => {
      const claimed = await tx.userQuest.updateMany({
        where: { id: userQuestId, pointsAwarded: 0 },
        data: { pointsAwarded: reward },
      });
      // Lost the race, or already paid. Either way: no second credit.
      if (claimed.count !== 1) return null;

      return creditPoints(tx, userId, reward);
    });
  } catch (error) {
    console.error(`[points] failed to award ${context}`, {
      userId,
      userQuestId,
      reward,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

