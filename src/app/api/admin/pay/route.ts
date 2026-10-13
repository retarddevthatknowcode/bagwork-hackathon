import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";
import { USDC_MINT } from "@/lib/privy/config";
import { calculateFeeSplit } from "@/lib/solana/burn";
import { isValidSolanaAddress, isValidTxSignature, explorerUrl } from "@/lib/solana/connection";
import { confirmPayoutTransfer } from "@/lib/solana/confirm";
import { buildPayoutTransaction } from "@/lib/solana/payments";
import { resolvePayoutDestination } from "@/lib/solana/payout-destination";
import { recomputeLeaderboard } from "@/lib/leaderboard";
import { creditPayoutRewardsSafely } from "@/lib/profile/rewards";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/pay — pay a creator from the admin console.
 *
 * Two modes, because an operator's reality differs from a publisher's:
 *
 *   `{ submissionId, build: true }` → returns the **unsigned USDC transfer** (treasury →
 *   creator) plus the exact amounts and addresses, so the operator can see precisely what
 *   will move before anything happens.
 *
 *   `{ submissionId, txSignature }` → records a transfer that was actually sent. This is
 *   how an operator pays when the treasury is a hardware wallet or a multisig, or when
 *   they sent the USDC manually.
 *
 * Either way the payout row is only ever written against a real signature: a payout row
 * means money moved, and the older version of this flow invented a base58 string. The
 * submission owner is credited (not the operator), and the ranking table is rebuilt.
 *
 * Admin auth is the `bagwork_admin` cookie, so this works without the operator having a
 * Privy wallet linked.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const submissionId = body?.submissionId;
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    include: {
      campaign: { include: { project: true } },
      user: { select: { id: true, handle: true, walletAddress: true, payoutWallet: true } },
    },
  });
  if (!sub) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const treasury = sub.campaign.project.treasury;
  const creatorWallet = resolvePayoutDestination(sub.user);
  const amount = sub.payoutAmount ?? 0;

  // ---- mode 1: build the transfer so the operator can see it before sending ----
  if (body.build === true) {
    if (!isValidSolanaAddress(treasury)) {
      return NextResponse.json(
        { error: `Bag "${sub.campaign.title}" has no valid treasury address.` },
        { status: 422 },
      );
    }
    if (!creatorWallet || !isValidSolanaAddress(creatorWallet)) {
      return NextResponse.json(
        { error: "This creator has no Solana wallet linked, so there is nowhere to send." },
        { status: 422 },
      );
    }
    if (amount <= 0) {
      return NextResponse.json(
        { error: "No payout amount on this submission — approve it with an amount first." },
        { status: 400 },
      );
    }

    // The RPC is the only external dependency here, so a build failure is almost always a
    // chain/provider problem rather than a bug. Surface it as 502 with the real reason
    // instead of letting it become an opaque 500.
    let built;
    try {
      built = await buildPayoutTransaction({
        treasury,
        recipient: creatorWallet,
        mint: USDC_MINT,
        amount,
      });
    } catch (error) {
      // Log the full shape, not just `.message`: a wrapped `fetch failed` from undici can
      // arrive with useful detail on `cause` rather than the top-level message.
      console.error("[api/admin/pay] build failed", {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        cause: (error as { cause?: unknown })?.cause,
        stack: error instanceof Error ? error.stack?.slice(0, 600) : undefined,
      });
      const reason =
        (error instanceof Error && error.message) ||
        (error instanceof Error ? error.name : "") ||
        "the Solana RPC could not be reached";
      return NextResponse.json(
        { error: `Could not build the transfer — ${reason}.` },
        { status: 502 },
      );
    }
    const fee = calculateFeeSplit(amount);
    return NextResponse.json(
      {
        ...built,
        amount,
        fee: fee.platformFee,
        treasury: fee.treasury,
        burn: fee.burn,
        campaignTitle: sub.campaign.title,
        creatorHandle: sub.user?.handle ?? null,
        creatorWallet,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // ---- mode 2: record a settled transfer ----
  const providedSignature = String(body.txSignature ?? "").trim();
  if (!isValidTxSignature(providedSignature)) {
    return NextResponse.json(
      {
        error:
          "txSignature required — send the transfer on-chain first, then record the signature it returned.",
      },
      { status: 400 },
    );
  }

  if (sub.status === "paid") {
    return NextResponse.json(
      { error: "This submission has already been paid", txSignature: sub.txSignature },
      { status: 409 },
    );
  }
  if (sub.status !== "approved") {
    return NextResponse.json(
      { error: `Submission is ${sub.status} — approve it before paying.` },
      { status: 400 },
    );
  }
  if (amount <= 0) {
    return NextResponse.json({ error: "Payout amount not computed" }, { status: 400 });
  }

  const alreadyRecorded = await db.payout.findUnique({ where: { submissionId: sub.id } });
  if (alreadyRecorded) {
    return NextResponse.json(
      { error: "A payout is already recorded for this submission" },
      { status: 409 },
    );
  }

  if (!creatorWallet || !isValidSolanaAddress(creatorWallet)) {
    return NextResponse.json(
      { error: "This creator has no Solana wallet linked, so no payout can be verified." },
      { status: 422 },
    );
  }

  /*
   * Admin payouts are built in USDC (`USDC_MINT` above), whatever the bag is priced in, so this is
   * the mint the confirmation checks. Verifying against the campaign's token instead would fail
   * every single admin payout, which is exactly the kind of mistake that only shows up in
   * production.
   */
  const confirmation = await confirmPayoutTransfer({
    signature: providedSignature,
    recipient: creatorWallet,
    mint: USDC_MINT,
    amount,
  });

  if (confirmation.status === "pending") {
    return NextResponse.json({ error: confirmation.reason, retryable: true }, { status: 409 });
  }

  if (confirmation.status === "failed") {
    return NextResponse.json({ error: confirmation.reason, retryable: false }, { status: 422 });
  }

  const fee = calculateFeeSplit(amount).platformFee;

  const payout = await db.payout.create({
    data: {
      submissionId: sub.id,
      userId: sub.userId,
      amount,
      token: "USDC",
      txSignature: providedSignature,
      status: "confirmed",
      // Only written after the chain check above, so it is a verified timestamp.
      confirmedAt: new Date(),
    },
  });

  /*
   * Keep the campaign's spend counter in step.
   *
   * This path records a transfer the operator has already sent and verified, so there is nothing to
   * reserve — refusing it would be absurd when the money has already left. But `paid_out` is what
   * the budget guard compares against, so a payout recorded here without it would silently hand the
   * bag budget it had already spent.
   */
  await db.campaign
    .update({ where: { id: sub.campaignId }, data: { paidOut: { increment: amount } } })
    .catch((error) => {
      console.warn("[api/admin/pay] could not record the campaign spend", error);
    });

  await db.submission.update({
    where: { id: sub.id },
    data: {
      status: "paid",
      txSignature: providedSignature,
      feeAmount: fee,
      reviewNote: `${sub.reviewNote ?? ""} Paid by admin.`.trim(),
    },
  });

  // Credit the creator, never the operator. Points come from the same call, so a profile can
  // only ever move forward on money that actually settled.
  const reward = await creditPayoutRewardsSafely(
    sub.userId,
    amount,
    `admin payout for submission ${sub.id}`,
  );

  const rankedCreators = await recomputeLeaderboard().catch(() => 0);

  return NextResponse.json({
    ok: true,
    payout,
    amount,
    fee,
    token: "USDC",
    explorerUrl: explorerUrl("tx", providedSignature),
    rankedCreators,
    /** Points this payout added, and the profile's new totals. */
    pointsAwarded: reward?.awarded ?? 0,
    points: reward?.points ?? null,
    level: reward?.level ?? null,
  });
}
