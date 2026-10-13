import type { Prisma } from "@prisma/client";
import {
  normalizePlatform,
  normalizePlatforms,
  type Campaign,
  type FeeDeposit,
  type Platform,
  type Submission,
  type LeaderboardEntry,
} from "./types";

type CampaignRow = Prisma.CampaignGetPayload<{
  include: { project: true };
}>;
type SubmissionRow = Prisma.SubmissionGetPayload<{
  include: { campaign: { include: { project: true } } };
}>;

/**
 * Figures `mapCampaign` cannot derive from the campaign row itself. The caller computes
 * them in the same query (`_count` + a filtered include of paid submissions) so a bag's
 * spend is always the real settled total, never `budget - fundedAmount` — which is
 * always zero because a bag is funded for its full budget at creation.
 */
export interface CampaignAggregates {
  /** Rows in `submissions` for this campaign. */
  submissionsCount: number;
  /** Sum of `payoutAmount` across submissions with status `paid`. */
  spent: number;
}

/**
 * Prisma `Json` columns arrive as `JsonValue`. Narrow them to a string array, dropping
 * anything unexpected rather than throwing — the values are user-supplied at write time,
 * so the read path must not trust their shape.
 */
function asStringArray(value: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function mapCampaign(
  row: CampaignRow,
  aggregates: CampaignAggregates = { submissionsCount: 0, spent: 0 },
): Campaign {
  // Canonicalised: rows written before the casing fix stored `["X","TIKTOK"]`, which
  // silently missed every platform glyph lookup.
  const platforms = normalizePlatforms(row.platforms);
  const geo = asStringArray(row.geo);
  const endsAt = row.endsAt instanceof Date ? row.endsAt.toISOString() : String(row.endsAt);
  const spent = Math.max(0, aggregates.spent);
  return {
    id: row.id,
    createdBy: row.createdBy,
    token: {
      symbol: row.project.tokenSymbol,
      name: row.project.tokenName ?? row.project.name,
      color: row.project.tokenColor,
      mint: row.project.tokenMint,
      decimals: row.project.tokenDecimals,
      logoUrl: row.project.tokenLogoUrl,
    },
    title: row.title,
    contentType: row.contentType as Campaign["contentType"],
    rateType: row.rateType as Campaign["rateType"],
    ratePer1k: row.ratePer1k,
    maxPayout: row.maxPayout,
    budget: row.budget,
    fundedAmount: row.fundedAmount,
    spent,
    remaining: Math.max(0, row.budget - spent),
    holderGate: row.holderGate,
    holderMin: row.holderMin,
    platforms,
    status: row.status as Campaign["status"],
    submissionsCount: aggregates.submissionsCount,
    slotsRemaining: row.slotsRemaining,
    endsAt,
    description: row.description,
    geo,
    bannerUrl: row.bannerUrl,
    chain: row.chain,
    paymentModel: row.paymentModel as Campaign["paymentModel"],
    fixedFee: row.fixedFee,
    maxSubmissions: row.maxSubmissions,
    maxPerCreator: row.maxPerCreator,
    treasury: row.treasury,
    fundingSignature: row.fundingSignature,
    fundedAt:
      row.fundedAt instanceof Date ? row.fundedAt.toISOString() : (row.fundedAt ?? null),
    feeRedirectEnabled: row.feeRedirectEnabled,
    feeRedirectPct: row.feeRedirectPct,
    feeMint: row.feeMint,
    feeRaisedUsdc: row.feeRaisedUsdc,
    // Which of the two products this bag is, and the launched coin's own face when there is one.
    kind: row.kind === "FLYWHEEL" ? "FLYWHEEL" : "FIXED",
    tokenImageUrl: row.tokenImageUrl,
  };
}

/** Maps a fee deposit row for the campaign page's history list. */
export function mapFeeDeposit(row: {
  id: string;
  signature: string;
  campaignId: string | null;
  mint: string;
  symbol: string;
  rawAmount: string;
  tokenAmount: number;
  fromAddress: string;
  status: string;
  usdcAmount: number | null;
  /** What the deposit was worth when a swap was declined. Null when it was never quoted. */
  estimatedUsdc: number | null;
  swapSignature: string | null;
  swapError: string | null;
  receivedAt: Date;
  swappedAt: Date | null;
}): FeeDeposit {
  return {
    id: row.id,
    signature: row.signature,
    campaignId: row.campaignId,
    mint: row.mint,
    symbol: row.symbol,
    rawAmount: row.rawAmount,
    tokenAmount: row.tokenAmount,
    fromAddress: row.fromAddress,
    status: row.status,
    usdcAmount: row.usdcAmount,
    estimatedUsdc: row.estimatedUsdc,
    swapSignature: row.swapSignature,
    swapError: row.swapError,
    receivedAt:
      row.receivedAt instanceof Date ? row.receivedAt.toISOString() : String(row.receivedAt),
    swappedAt:
      row.swappedAt instanceof Date ? row.swappedAt.toISOString() : (row.swappedAt ?? null),
  };
}

/**
 * The `rateType` a given payment model implies.
 *
 * `FIXED` is the only model that pays a flat fee per post; RPM and HYBRID both scale with
 * views, which is what `DYNAMIC` already meant to the review engine and the payout maths.
 * Deriving it in one exported place keeps the new `paymentModel` field and the
 * pre-existing `rateType` column from ever disagreeing.
 */
export function rateTypeFor(paymentModel: Campaign["paymentModel"]): Campaign["rateType"] {
  return paymentModel === "FIXED" ? "FIXED" : "DYNAMIC";
}

export function mapSubmission(row: SubmissionRow): Submission {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : String(row.createdAt);
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignTitle: row.campaign.title,
    tokenSymbol: row.campaign.project.tokenSymbol,
    postUrl: row.postUrl,
    claimedAt:
      row.claimedAt instanceof Date
        ? row.claimedAt.toISOString()
        : (row.claimedAt ?? null),
    // Same canonicalisation as campaigns: the seed wrote uppercase platform keys.
    platform: (normalizePlatform(row.platform) ?? "x") as Platform,
    verifiedHandle: row.verifiedHandle,
    verifiedPlatform: normalizePlatform(row.verifiedPlatform),
    status: row.status as Submission["status"],
    views: row.views,
    likes: row.likes,
    reposts: row.reposts,
    qualityScore: row.qualityScore,
    authenticityScore: row.authenticityScore,
    payoutAmount: row.payoutAmount,
    txSignature: row.txSignature,
    createdAt,
    reviewNote: row.reviewNote,
  };
}

export function mapLeaderboard(row: {
  rank: number;
  handle: string;
  wallet: string;
  trustScore: number;
  totalEarned: number;
  submissions: number;
  approvalRate: number;
  badge: string | null;
}): LeaderboardEntry {
  return {
    rank: row.rank,
    handle: row.handle,
    wallet: row.wallet,
    trustScore: row.trustScore,
    totalEarned: row.totalEarned,
    submissions: row.submissions,
    approvalRate: row.approvalRate,
    badge: (row.badge as LeaderboardEntry["badge"]) ?? null,
  };
}

