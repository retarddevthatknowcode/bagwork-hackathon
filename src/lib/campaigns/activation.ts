import type { Campaign, Project } from "@prisma/client";

import { db } from "@/lib/db";
import { WSOL_MINT } from "@/lib/solana/constants";
import { verifyFundingTransfer } from "@/lib/solana/funding";
import {
  isConfiguredTreasury,
  treasuryAddressFor,
  treasuryKindFor,
} from "@/lib/solana/treasury";

/**
 * Turning a verified on-chain transfer into a live bag.
 *
 * One implementation, two callers:
 *
 *   - `POST /api/campaigns/[id]/fund`, where the publisher posts the signature their wallet
 *     returned;
 *   - the Alchemy treasury webhook, where the deposit is noticed rather than announced.
 *
 * They must agree, because a bag going LIVE is the promise that there is money behind it. Two
 * copies of this logic would eventually disagree about the mint, the amount or the signer, and the
 * version that was wrong would be the version nobody was reading.
 *
 * What is checked is in `verifyFundingTransfer`: the transaction succeeded, the tokens landed in
 * the treasury's associated token account for *this campaign's* mint, at least the full budget
 * arrived, and the publisher's own wallet signed it. Nothing here trusts a signature on its own.
 */

export type CampaignWithProject = Campaign & {
  project: Project;
  creator?: { walletAddress: string | null; payoutWallet: string | null } | null;
};

export type ActivationOutcome =
  | {
      status: "activated";
      /** The updated row, with its project, ready to map for a response. */
      campaign: Campaign & { project: Project };
      received: number;
      signer: string;
      destination: string;
    }
  | { status: "pending"; reason: string }
  | { status: "invalid"; reason: string };

/**
 * The wallet the funding transfer had to come from.
 *
 * `fundingWallet` is recorded when the transfer is built, which is the normal path. The creator's
 * own linked wallet is the fallback, and it is the *same* check rather than a weaker one: a
 * publisher can only fund a bag they created, so their profile wallet and the wallet they paid
 * from are the only two candidates that can ever be legitimate.
 */
export function expectedFundingSigner(campaign: CampaignWithProject): string | null {
  return campaign.fundingWallet ?? campaign.creator?.walletAddress ?? null;
}

/**
 * Verifies a transfer against a campaign and flips it LIVE when it checks out.
 *
 * Returns rather than throwing for every expected outcome, so both callers can map the three cases
 * to their own response shape: `pending` is retryable, `invalid` is final, `activated` is done.
 */
export async function activateCampaignFromTransfer({
  campaign,
  signature,
}: {
  campaign: CampaignWithProject;
  signature: string;
}): Promise<ActivationOutcome> {
  /*
   * The treasury must not have moved since the bag was created — and "moved" is per kind now: this
   * campaign's money belongs to the FIXED or FEE wallet it was created against, so that is the one
   * whose current address is checked.
   *
   * The publisher has just sent money to the address they were shown, so accepting a transfer to a
   * different account would strand that budget — a bag that reads as funded while the money sits
   * somewhere this app will never pay out of.
   */
  const currentTreasury = treasuryAddressFor(treasuryKindFor(campaign));
  if (currentTreasury !== campaign.treasury) {
    return {
      status: "invalid",
      reason:
        "The Bagwork treasury changed after this bag was created, so this transfer cannot be matched to it. Contact support.",
    };
  }

  const signer = expectedFundingSigner(campaign);
  if (!signer) {
    return {
      status: "pending",
      reason:
        "This bag has no funding wallet recorded yet, so the transfer cannot be attributed to the publisher. Open the bag and build the transfer, or ask an operator to match it.",
    };
  }

  /*
   * A treasury can never be the publisher.
   *
   * This is the second half of the guard `POST /build-funding` applies before it will build
   * anything, and it matters here because this function has two callers: the fund route, and the
   * Alchemy webhook that notices a deposit rather than being told about one. A webhook has no
   * client to validate, so the rule has to live where both paths pass through.
   *
   * The accounting reason is the point: the FIXED treasury holds every fixed bag's money at once,
   * so a transfer out of it being credited to one bag's budget would move pooled funds into a
   * single campaign's ledger. Nothing here signs with a treasury key — the signer is read off a
   * confirmed transaction — but a bag funded *from* a treasury must never activate.
   */
  if (isConfiguredTreasury(signer)) {
    return {
      status: "invalid",
      reason:
        "That transfer came from a Bagwork treasury, which cannot fund a bag. A budget has to be sent from the publisher's own wallet.",
    };
  }

  const { tokenMint, tokenDecimals } = campaign.project;

  /*
   * The amount is recomputed from the campaign rather than taken from the transfer, so a caller
   * cannot fund a bag for less than it promised and have it count as funded.
   */
  const expectedRaw = BigInt(Math.round(campaign.budget * 10 ** tokenDecimals));
  if (expectedRaw <= BigInt(0)) {
    return { status: "invalid", reason: "This bag's budget rounds to zero in raw units" };
  }

  const check = await verifyFundingTransfer({
    signature,
    mint: tokenMint,
    treasury: campaign.treasury,
    publisherWallet: signer,
    expectedRaw,
    expectedDecimals: tokenDecimals,
    // A SOL-priced bag is funded with a native transfer, because that is what a wallet holds.
    acceptNativeSol: tokenMint === WSOL_MINT,
  });

  if (check.status !== "verified") return check;

  const funded = await db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: campaign.slotsRemaining > 0 ? "LIVE" : "FILLING",
      // The verified amount, not the promised one: `budget` is what the bag advertises and this is
      // what actually backs it.
      fundedAmount: check.funding.received,
      fundingSignature: signature,
      fundedAt: new Date(),
    },
    include: { project: true },
  });

  console.info("[funding] activated campaign from a verified transfer", {
    campaignId: campaign.id,
    signature,
    symbol: campaign.project.tokenSymbol,
    received: check.funding.received,
    destination: check.funding.destination,
    signer: check.funding.signer,
  });

  return {
    status: "activated",
    campaign: funded,
    received: check.funding.received,
    signer: check.funding.signer,
    destination: check.funding.destination,
  };
}
