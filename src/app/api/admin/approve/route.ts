import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";
import { calculateFeeSplit } from "@/lib/solana/burn";
import { syncWeeklyQuestsSafely } from "@/lib/quests/engine";
import { settleApprovedSubmission, type PayoutSettleOutcome } from "@/lib/payouts/settle";

export const dynamic = "force-dynamic";

// An approval pays out on the spot: build + sign + send + confirm on-chain, which needs room
// beyond the default timeout.
export const maxDuration = 60;

// POST /api/admin/approve — approve a submission + optionally adjust payout
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  const sub = await db.submission.findUnique({
    where: { id: body.submissionId },
    include: { campaign: { include: { project: true } } },
  });
  if (!sub) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Use adjusted payout if provided, otherwise use AI-calculated payout
  const finalPayout = body.adjustedPayout
    ? Math.round(Number(body.adjustedPayout) * 100) / 100
    : sub.payoutAmount;

  if (!finalPayout || finalPayout <= 0) {
    return NextResponse.json({ error: "No payout amount — set one before approving" }, { status: 400 });
  }

  const updated = await db.submission.update({
    where: { id: body.submissionId },
    data: {
      status: "approved",
      payoutAmount: finalPayout,
      /**
       * The week this submission's verified views belong to (see the "View Hunter" quest).
       *
       * Set unless it is already stamped: re-approving a submission must not move its views into
       * a later week, which would let the same views count twice.
       */
      approvedAt: sub.approvedAt ?? new Date(),
      // One source of truth for the split, shared with `/api/admin/pay` and the publisher's
      // payout route. Computing it inline is how the two ended up disagreeing (2.13 here
      // vs 2.00 there) on the same payout.
      feeAmount: calculateFeeSplit(finalPayout).platformFee,
      reviewNote: `Approved by admin. Payout: $${finalPayout}. ${body.adminNote ?? ""}`.trim(),
    },
  });

  // An admin approval skips the review engine, so the weekly board is refreshed here instead —
  // this is the other place a verdict is decided.
  await syncWeeklyQuestsSafely(sub.userId, `admin approval of submission ${sub.id}`);

  /*
   * Approval is money owed, so the automatic payout runs immediately — from this bag's own
   * treasury, signed server-side. A payout that cannot be sent yet comes back as a blocked
   * reason below (and stays `approved` for the daily sweep), so the operator sees exactly why
   * rather than discovering a queue that never drains.
   */
  const payout: PayoutSettleOutcome = await settleApprovedSubmission(
    updated.id,
    "admin",
  ).catch((error) => ({
    status: "pending" as const,
    submissionId: updated.id,
    reason: error instanceof Error ? error.message : "The automatic payout attempt failed",
  }));

  return NextResponse.json({
    ok: true,
    submissionId: updated.id,
    status: "approved",
    payoutAmount: finalPayout,
    payout,
  });
}
