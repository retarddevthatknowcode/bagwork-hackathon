import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import {
  activateCampaignFromTransfer,
  expectedFundingSigner,
} from "@/lib/campaigns/activation";
import { mapCampaign } from "@/lib/mappers";
import { isValidTxSignature } from "@/lib/solana/connection";
import { treasuryAddressFor, treasuryKindFor } from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";

/**
 * POST /api/campaigns/[id]/fund — activate a bag once its budget has genuinely arrived.
 *
 * The publisher signs a transfer of the full budget into the Bagwork treasury from their own
 * wallet, then posts the resulting signature here. Before anything changes, that signature is
 * resolved against the chain and checked for the destination, mint, amount and signer (see
 * `lib/solana/funding.ts`). Only a transfer that actually delivered the budget flips the bag to
 * LIVE; anything else leaves it as a DRAFT with the reason attached.
 *
 * This replaces the earlier version, which stored whatever hash it was given and set the
 * campaign LIVE. A signature proves a transaction exists, not that it paid us — so that
 * version could be used to publish a bag with no money behind it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { txSignature?: unknown } | null;
  const signature = String(body?.txSignature ?? "").trim();

  if (!isValidTxSignature(signature)) {
    return NextResponse.json(
      { error: "A valid transaction signature is required to activate a bag" },
      { status: 400 },
    );
  }

  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      project: true,
      // Needed to work out which wallet the transfer had to come from when `fundingWallet` was
      // never recorded (a bag funded by hand rather than through the build step).
      creator: { select: { walletAddress: true, payoutWallet: true } },
    },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Bag not found" }, { status: 404 });
  }

  // Only the publisher who created the bag may activate it.
  if (campaign.createdBy !== session.user.id) {
    return NextResponse.json(
      { error: "Only the publisher who created this bag can activate it" },
      { status: 403 },
    );
  }

  if (campaign.status !== "DRAFT") {
    return NextResponse.json(
      {
        error: `This bag is already ${campaign.status.toLowerCase()} and cannot be re-funded`,
      },
      { status: 409 },
    );
  }

  // The budget must come from a wallet this bag can attribute the transfer to: the one the
  // transaction was built for, or the creator's own. See `expectedFundingSigner`.
  if (!expectedFundingSigner(campaign)) {
    return NextResponse.json(
      { error: "Link a Solana wallet to your account before funding a bag" },
      { status: 400 },
    );
  }

  // The treasury must not have moved between creation and funding: the publisher has just sent
  // money to the address they were shown, so accepting a transfer to a different one would
  // strand the budget. Per kind — this bag's money belongs to the FIXED (or FEE) wallet it was
  // created against. `activateCampaignFromTransfer` re-checks this for the webhook path; it is
  // repeated here so this route keeps its own 409 rather than folding into the generic 422.
  if (treasuryAddressFor(treasuryKindFor(campaign)) !== campaign.treasury) {
    return NextResponse.json(
      {
        error:
          "The Bagwork treasury changed after this bag was created, so this transfer cannot be matched to it. Contact support.",
      },
      { status: 409 },
    );
  }

  /*
   * Verification and activation live in `lib/campaigns/activation.ts`, shared with the treasury
   * webhook: both paths must agree on what "funded" means, down to the mint, the amount and the
   * signing wallet. Everything below only maps the three outcomes to this route's responses.
   */
  const outcome = await activateCampaignFromTransfer({ campaign, signature });

  if (outcome.status === "pending") {
    // `retryable` lets the client poll instead of showing a dead end while the transaction
    // confirms. The bag is untouched.
    return NextResponse.json({ error: outcome.reason, retryable: true }, { status: 409 });
  }

  if (outcome.status === "invalid") {
    // The bag stays a DRAFT. It can still be funded later with a correct transfer.
    return NextResponse.json({ error: outcome.reason, retryable: false }, { status: 422 });
  }

  return NextResponse.json({
    campaign: mapCampaign(outcome.campaign, { submissionsCount: 0, spent: 0 }),
    funding: {
      verified: true,
      received: outcome.received,
      signature,
    },
  });
}
