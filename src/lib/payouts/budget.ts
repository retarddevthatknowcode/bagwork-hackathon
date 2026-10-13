import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * The per-campaign budget guard for flywheel payouts.
 *
 * The ledger has always been per-campaign: every fee deposit carries a `campaignId`, and a bag's
 * numbers are its own rows. **Spending did not match.** `settleApprovedSubmission` used to check
 * only that the *treasury wallet* held enough — and the FEE wallet is shared by every flywheel bag
 * — so a bag whose own budget was exhausted could still be paid out of another bag's fees.
 *
 * Two rules live here:
 *
 *   1. **The business limit is this bag's budget.** `budget - paid_out` is what may still be
 *      spent. The wallet balance is only ever "can we physically send it".
 *   2. **The check is atomic.** `reserveCampaignBudget` is a single conditional UPDATE, so two
 *      payouts for the same bag racing each other cannot both pass. It is raw SQL because Prisma
 *      cannot express `budget - paid_out >= amount` in a `where` — it has no column-to-column
 *      comparison — and a read-then-write check in JS is exactly the race this replaces.
 *
 * Float note: `amount` is cents-rounded upstream, and the comparison carries a tiny epsilon so the
 * binary representation of money (`0.1 + 0.2`) cannot produce a false block.
 */

/** Slack on the budget comparison. Far below one cent, far above double-precision noise. */
const EPSILON = 1e-6;

/**
 * Claims `amount` of a campaign's remaining budget.
 *
 * Returns `false` when the bag cannot afford it — and writes nothing in that case. A `true` result
 * is a **reservation**: the caller either settles it (leaves it standing, once the payout is
 * confirmed or genuinely in flight) or hands it back with {@link releaseCampaignBudget}, when the
 * attempt is known not to have moved money.
 */
export async function reserveCampaignBudget(campaignId: string, amount: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ paid_out: number }[]>(Prisma.sql`
    UPDATE "campaigns"
       SET "paid_out" = "paid_out" + ${amount}
     WHERE "id" = ${campaignId}
       AND "budget" - "paid_out" + ${EPSILON} >= ${amount}
    RETURNING "paid_out"
  `);
  return rows.length > 0;
}

/**
 * Hands a reservation back.
 *
 * Clamped at the bag's real settled total, computed in the same statement, so a release can never
 * drag `paid_out` below money that has genuinely left. That also makes the call safe to make twice:
 * two paths both concluding "nothing moved" cannot leave the guard more permissive than the books.
 */
export async function releaseCampaignBudget(campaignId: string, amount: number): Promise<void> {
  try {
    await db.$executeRaw(Prisma.sql`
      UPDATE "campaigns" c
         SET "paid_out" = GREATEST(
               c."paid_out" - ${amount},
               COALESCE((
                 SELECT SUM(s."payout_amount")
                   FROM "submissions" s
                  WHERE s."campaign_id" = c."id" AND s."status" = 'paid'
               ), 0)
             )
       WHERE c."id" = ${campaignId}
    `);
  } catch (error) {
    // Bookkeeping must never break the outcome path it is tidying up after; the next pass retries.
    console.warn(
      "[payouts/budget] could not release a reservation:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** What a bag has, for the message a blocked payout carries. */
export interface CampaignBudgetSnapshot {
  budget: number;
  /** Settled payouts — the same rule `mappers` uses for the figure the UI shows. */
  spent: number;
  /** Settled plus reserved: what the guard actually compared against. */
  committed: number;
  remaining: number;
}

/** Read-only view of a bag's budget, used only to explain a block. */
export async function campaignBudgetSnapshot(
  campaignId: string,
): Promise<CampaignBudgetSnapshot | null> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { budget: true, paidOut: true },
  });
  if (!campaign) return null;

  const settled = await db.submission.aggregate({
    where: { campaignId, status: "paid" },
    _sum: { payoutAmount: true },
  });
  const spent = settled._sum.payoutAmount ?? 0;
  const committed = Math.max(spent, campaign.paidOut);

  return {
    budget: campaign.budget,
    spent,
    committed,
    remaining: Math.max(0, campaign.budget - committed),
  };
}
