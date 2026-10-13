import type { CharacterConfig } from "@/lib/profile/character";

export type Platform = "x" | "tiktok" | "instagram" | "youtube";
export type ContentType = "PROMO" | "CLIPPING" | "UGC" | "ORIGINAL";

/**
 * The bag's funding type — the only taxonomy this product has.
 *
 * There used to be a second one: a content category (PROMO / CLIPPING / UGC / ORIGINAL) that no
 * launcher ever chose as a product concept. It surfaced as "PROMO BAG" in a bag's eyebrow and
 * "Content type: PROMO" in its brief, which told a visitor nothing they could act on — what to post
 * is described in the publisher's own words, in the brief, and that is the only place it belongs.
 *
 * Two types, and they are not labels: they are the two ways a bag is funded, which is a fact about
 * the bag rather than a category someone picked.
 */
export type BagType = "FEE_FLYWHEEL" | "FIXED_BUDGET";

/**
 * Which of the two funding models a bag uses.
 *
 * Derived from what the bag *is*, never from a stored label. A launched flywheel is
 * `kind: "FLYWHEEL"`; a hand-made fee-redirect bag is one with fee redirect switched on. Both are
 * funded by a coin's trading fees. Everything else is a budget the publisher transferred up front.
 */
export function bagTypeOf(campaign: {
  kind?: string | null;
  feeRedirectEnabled?: boolean | null;
}): BagType {
  return campaign.kind === "FLYWHEEL" || campaign.feeRedirectEnabled === true
    ? "FEE_FLYWHEEL"
    : "FIXED_BUDGET";
}

/** How each type reads in prose — a row, a filter, a sentence. */
export const BAG_TYPE_LABELS: Record<BagType, string> = {
  FEE_FLYWHEEL: "Fee flywheel bag",
  FIXED_BUDGET: "Fixed budget bag",
};

/** How each reads where space is short — an eyebrow, a chip. */
export const BAG_TYPE_SHORT: Record<BagType, string> = {
  FEE_FLYWHEEL: "FEE FLYWHEEL",
  FIXED_BUDGET: "FIXED BUDGET",
};
export type RateType = "DYNAMIC" | "FIXED";
/**
 * Bag lifecycle.
 *
 * `LIVE` and `FILLING` are the only states that accept creators — every claim/submission
 * route checks for exactly those two.
 *
 * `PAUSED` is an operator stop from the admin portal: the bag keeps its budget, its slots and
 * its page, but takes no new claims or posts and drops out of the marketplace feed until it is
 * resumed. Creators already on it still see it in their submissions. It is a legitimate
 * lifecycle state rather than an admin artefact — nothing in the public UI labels *who*
 * paused it, and it is never used to mark operator-created bags.
 *
 * `DRAFT` is created-but-not-funded (or an unpublished operator draft): never in the feed.
 */
export type CampaignStatus = "LIVE" | "FILLING" | "PAUSED" | "ENDED" | "DRAFT";

/** Every platform key the product supports, in canonical (lowercase) form. */
export const PLATFORMS: Platform[] = ["x", "tiktok", "instagram", "youtube"];

/**
 * Canonicalises a platform value that may arrive from any write path.
 *
 * Two write paths exist — `POST /api/campaigns` (lowercase) and the seed script (which
 * shipped uppercase `["X","TIKTOK"]`) — and the read path used to trust whatever was in
 * the `platforms` column. An uppercase value silently missed every
 * `PLATFORM_GLYPHS` / `platformGlyph` lookup, so the bag cards rendered empty platform
 * tiles and the submit dropdown read "TIKTOK" instead of "TikTok". Normalising here
 * fixes existing rows without a migration and stops the two paths drifting again.
 */
export function normalizePlatform(value: unknown): Platform | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (key === "twitter" || key === "x/twitter") return "x";
  return (PLATFORMS as string[]).includes(key) ? (key as Platform) : null;
}

/** Normalises a list, dropping anything unrecognised instead of throwing. */
export function normalizePlatforms(value: unknown): Platform[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<Platform>();
  for (const entry of value) {
    const platform = normalizePlatform(entry);
    if (platform) seen.add(platform);
  }
  return [...seen];
}

export interface Token {
  symbol: string;
  name: string;
  color: string; // hex for token logo bg
  mint: string;
  decimals: number;
  logoUrl: string | null;
}

/** How a bag pays out. `rateType` is derived from this on write. */
export type PaymentModel = "FIXED" | "RPM" | "HYBRID";

/** Tokens a publisher can budget in. `CUSTOM` means "paste a contract address". */
export type TokenKind = "USDC" | "SOL" | "CUSTOM";

/**
 * Chains the bag form offers.
 *
 * Only Solana is live; the rest are listed so the picker is already shaped for them and
 * adding one is a config change rather than a redesign. Anything not `live` must be
 * disabled in the UI — nothing may silently create a bag on a chain that cannot be paid.
 */
export const CHAINS: { id: string; label: string; live: boolean }[] = [
  { id: "solana", label: "Solana", live: true },
  { id: "base", label: "Base", live: false },
  { id: "ethereum", label: "Ethereum", live: false },
];

export const PAYMENT_MODELS: { id: PaymentModel; label: string; blurb: string }[] = [
  { id: "FIXED", label: "Fixed per post", blurb: "Every approved post earns the same flat fee." },
  { id: "RPM", label: "RPM", blurb: "Reward per 1,000 views — pay scales with reach." },
  { id: "HYBRID", label: "Hybrid", blurb: "A flat fee plus a per-1,000-view bonus." },
];

export interface Campaign {
  id: string;
  /**
   * `User.id` of the publisher who funded this bag, or `null` for bags that predate
   * ownership (the seeded test campaigns).
   */
  createdBy: string | null;
  token: Token;
  title: string;
  contentType: ContentType;
  rateType: RateType;
  ratePer1k: number; // USDC equivalent
  maxPayout: number;
  budget: number;
  /**
   * USDC committed to this bag. Set to the full budget when the publisher funds it, so
   * on its own it is NOT "amount spent" — it is the escrow commitment. Kept for the
   * funding receipt; `spent` / `remaining` are the figures the UI shows.
   */
  fundedAmount: number;
  /** USDC actually settled to creators so far (sum of paid payouts). */
  spent: number;
  /** USDC still available to creators: `budget - spent` (never negative). */
  remaining: number;
  holderGate: boolean;
  holderMin: number;
  platforms: Platform[];
  status: CampaignStatus;
  /** How many submissions have been made against this bag. */
  submissionsCount: number;
  slotsRemaining: number;
  endsAt: string; // ISO
  description: string;
  geo: string[];
  /** Banner artwork URL, or null to fall back to the token-colour wash. */
  bannerUrl: string | null;
  chain: string;
  paymentModel: PaymentModel;
  /** Flat component of a HYBRID payout. Null unless the model is HYBRID. */
  fixedFee: number | null;
  maxSubmissions: number | null;
  maxPerCreator: number | null;
  /** Bagwork's treasury, which custodies the budget. Publisher funds cannot be pulled back. */
  treasury: string;
  /** The on-chain transfer that funded the bag. Null until the campaign is activated. */
  fundingSignature: string | null;
  fundedAt: string | null;
  /**
   * FIXED | FLYWHEEL — which of the two products this bag is.
   *
   * Persisted rather than derived from `feeRedirectEnabled`: the flag says *how money arrives*,
   * this says *which product the publisher chose*, and the two stopped being the same thing once a
   * bag could be created by launching a coin as well as by pointing an existing token's fees at us.
   */
  kind: "FIXED" | "FLYWHEEL";
  /**
   * The launched coin's own artwork.
   *
   * Null for fixed-budget bags and for flywheels pointed at someone else's token, which fall back
   * to the token-colour wash the card already renders.
   */
  tokenImageUrl: string | null;
  /**
   * Fee Redirect: trading fees routed to Bagwork become this bag's budget.
   *
   * `feeRaisedUsdc` is tracked separately from `fundedAmount` so the self-funding part of the loop
   * is visible — "this bag has raised $412 of its own money from volume" is the point of the
   * feature, and it disappears if the two are summed.
   */
  feeRedirectEnabled: boolean;
  feeRedirectPct: number | null;
  /** The mint whose trading fees fund this bag. */
  feeMint: string | null;
  /** USDC credited from converted trading fees so far. */
  feeRaisedUsdc: number;
}

/**
 * A person who joined a bag, as shown on that bag's page.
 *
 * Deliberately thin, and deliberately not a submission. A bag page is readable by anyone, so this
 * carries identity and nothing about the work itself: no post links, no review verdicts, no
 * quality scores. `active` means only "has sent a link" — whether that link was approved or
 * rejected is between the creator and the campaign, and stays in My Submissions and on the
 * publisher's own side.
 */
export interface CampaignMember {
  id: string;
  /** Chosen name, else `@handle`, else the permanent Bagworker number. */
  name: string;
  handle: string | null;
  profileNumber: number | null;
  character: CharacterConfig | null;
  avatarId: string | null;
  /** When they claimed their slot — or first submitted, for rows that predate claims. */
  joinedAt: string;
  /** Has sent at least one link into this bag. Says nothing about how it was reviewed. */
  active: boolean;
}

/** One token transfer into the Bagwork fee wallet and what it converted to. */
export interface FeeDeposit {
  id: string;
  signature: string;
  campaignId: string | null;
  mint: string;
  symbol: string;
  rawAmount: string;
  tokenAmount: number;
  fromAddress: string;
  /** received | matched | swapped | no_route | below_minimum | failed | unmatched | swapping */
  status: string;
  usdcAmount: number | null;
  /** What the deposit was worth when a swap was declined. Null when it was never quoted. */
  estimatedUsdc?: number | null;
  swapSignature: string | null;
  swapError: string | null;
  receivedAt: string;
  swappedAt: string | null;
}

/**
 * The fee ledger for one bag, aggregated.
 *
 * Computed server-side because the deposit list the page receives is capped: a lifetime total taken
 * from a truncated list would quietly stop growing on a busy token. Every field is a real column or a
 * real sum — nothing here is estimated except `waitingUsdc`, which is flagged as such and is null
 * when no quote exists, so the UI can print "—" instead of inventing a number.
 */
export interface FeeSummary {
  /** Lifetime deposits attributed to this bag. */
  deposits: number;
  /** USDC that arrived from completed swaps. */
  swappedUsdc: number;
  swappedCount: number;
  lastSwapAt: string | null;
  /** Tokens sitting in the fee wallet, not yet converted. */
  waitingTokens: number;
  waitingCount: number;
  /** USD value of the waiting deposits, from the quotes the swap floor was applied to. */
  waitingUsdc: number | null;
  /** How many waiting deposits carry a quote — the rest are unpriced. */
  waitingPriced: number;
  /** Deposits held back specifically by the swap floor. */
  belowFloorCount: number;
  /** Deposits with no swap route yet (no liquidity). */
  noRouteCount: number;
  failedCount: number;
  lastDepositAt: string | null;
  /** The swap floor this deployment applies, in USD. */
  floorUsd: number;
}

/** The last completed fee sweep, as recorded by the cron or a manual run. */
export interface FeeSyncState {
  lastRunAt: string;
  scanned: number;
  swapped: number;
  creditedUsdc: number;
  belowMinimum: number;
  floorUsd: number;
  errors: string[];
}

export type SubmissionStatus =
  /** Slot claimed on a bag; the creator still has to add a link. */
  | "claimed"
  | "pending"
  | "reviewing"
  | "approved"
  | "rejected"
  | "paid";

export interface Submission {
  id: string;
  campaignId: string;
  campaignTitle: string;
  tokenSymbol: string;
  /** Null while the creator has only claimed a slot and not yet submitted a link. */
  postUrl: string | null;
  /** When the creator opted into the bag; null for rows that predate claims. */
  claimedAt: string | null;
  platform: Platform;
  /**
   * The verified social account this link was proven to come from, as bare handles.
   * Null on rows created before the anti-fraud gate existed.
   */
  verifiedHandle: string | null;
  verifiedPlatform: Platform | null;
  status: SubmissionStatus;
  views: number;
  likes: number;
  reposts: number;
  qualityScore: number; // 0-100 AI score
  authenticityScore: number; // 0-100 anti-bot score
  payoutAmount: number | null;
  txSignature: string | null;
  createdAt: string;
  reviewNote: string | null;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  wallet: string;
  trustScore: number;
  totalEarned: number;
  submissions: number;
  approvalRate: number;
  badge: "DIAMOND" | "PLATINUM" | "GOLD" | "SILVER" | "BRONZE" | null;
}

export interface Stats {
  totalPaid: number;
  activeCampaigns: number;
  creators: number;
  totalSubmissions: number;
  avgPayout: number;
  trustAvg: number;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
};

