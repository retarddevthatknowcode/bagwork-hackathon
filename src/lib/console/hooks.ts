"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import type { Campaign } from "@/lib/types";
import type {
  FeatureBoardPayload,
  FeatureDraft,
  FeatureDraftErrors,
  FeatureSort,
} from "@/lib/features/board";
import type { CharacterConfig } from "@/lib/profile/character";
import type { LeaderboardRange } from "@/lib/leaderboard-ranges";
import type { QuestMetric } from "@/lib/quests/weekly";
// `import type` only — erased at compile time, so the pump SDK never reaches the browser bundle.
import type { LaunchCostEstimate } from "@/lib/launch/instructions";
import type { LaunchDraft } from "@/lib/launch/wizard";

/* ------------------------------------------------------------------ types */

export interface Overview {
  metrics: {
    totalPaid: number;
    paid30: number;
    paidPrev30: number;
    liveBags: number;
    endingSoon: number;
    /** Everyone with an account. */
    creators: number;
    /** Creators with at least one settled payout — the number the labels mean. */
    earningCreators: number;
    avgReward: number;
    openBudget: number;
    slotsClaimedPct: number;
    awaitingPayout: number;
    feeBurned: number;
    settledCount: number;
  };
  weekly: { label: string; earned: number; submissions: number }[];
}

export interface PayoutRow {
  id: string;
  amount: number;
  token: string;
  txSignature: string;
  status: string;
  createdAt: string;
  explorerUrl: string;
  campaignId: string;
  campaignTitle: string;
  projectName: string;
  tokenSymbol: string;
  tokenColor: string;
  platform: string;
  views: number;
}

export interface PayoutsPayload {
  payouts: PayoutRow[];
  summary: {
    total: number;
    count: number;
    avg: number;
    thisMonth: number;
    last30: number;
    largest: number;
  };
  monthly: { label: string; value: number; count: number }[];
}

export interface ConsoleNotification {
  id: string;
  kind: "payout" | "approved" | "rejected" | "reviewing" | "new-bag";
  title: string;
  body: string;
  at: string;
  href: string;
}

export interface ProfilePayload {
  user: {
    id: string;
    handle: string | null;
    walletAddress: string | null;
    avatarColor: string;
    /** One of `NPC_AVATARS`. Null until the user picks one. */
    avatarId: string | null;
    /** The pixel character built in onboarding; null for older accounts. */
    character: CharacterConfig | null;
    /** `Bagworker#3578` — the permanent identity number. */
    profileNumber: number;
    trustScore: number;
    totalEarned: number;
    joinedAt: string;
    /** Lifetime points, and the level they resolve to. */
    points: number;
    level: number;
    pointsIntoLevel: number;
    pointsToNextLevel: number;
    /** 0–100, for a progress meter. */
    levelProgress: number;
    rank: number | null;
    badge: string | null;
    rankOf: number;
  };
  stats: {
    submissions: number;
    settled: number;
    approved: number;
    rejected: number;
    inFlight: number;
    approvalRate: number;
    streak: number;
    totalViews: number;
    totalLikes: number;
    engagementRate: number;
    avgQuality: number;
    avgAuthenticity: number;
    paidCount: number;
    bestPayout: number;
  };
  platforms: {
    platform: string;
    posts: number;
    earned: number;
    views: number;
  }[];
  weekly: { label: string; submissions: number; earned: number }[];
}

export interface CreateBagInput {
  // ---- Step 1: basics & content ----
  title: string;
  description: string;
  projectName: string;
  platforms: string[];
  /** Uploaded artwork, or an external http(s) URL. Null uses the token-colour wash. */
  bannerUrl: string | null;
  contentType: string;

  // ---- Step 2: budget, token & limits ----
  budget: number;
  /**
   * The token the budget is denominated in.
   *
   * `CUSTOM` carries the mint's own metadata (resolved by the server from the contract
   * address) because the decimals are what every amount is multiplied by at transfer time —
   * guessing them would be wrong by orders of magnitude.
   */
  token:
    | { kind: "USDC" }
    | { kind: "SOL" }
    | {
        kind: "CUSTOM";
        mint: string;
        symbol: string;
        name: string;
        decimals: number;
        logoUrl: string | null;
      };
  chain: string;
  paymentModel: "FIXED" | "RPM" | "HYBRID";
  /** Flat fee per post. Required for FIXED and HYBRID. */
  fixedFee?: number;
  /** Reward per 1,000 views. Required for RPM and HYBRID. */
  ratePer1k?: number;
  /** Per-post ceiling for RPM/HYBRID so one viral post cannot drain the bag. */
  maxPayout?: number;
  durationDays: number;
  maxSubmissions: number | null;
  maxPerCreator: number | null;
  holderGate: boolean;
  holderMin: number;
  tokenColor?: string;

  // ---- Fee Redirect (optional) ----
  /** Route a share of this token's trading fees into the bag's budget. */
  feeRedirectEnabled?: boolean;
  /** The share being redirected, for display. */
  feeRedirectPct?: number | null;
  /** The mint whose fees are redirected. Defaults to the budget token's mint. */
  feeMint?: string | null;
}

export interface CreateBagResult {
  campaign: { id: string; title: string };
  /**
   * Everything Step 3 needs to ask for a transfer: how much, in what, and to which address.
   * Returned by the server so the treasury a publisher is told to fund is the one the server
   * will pay from — never one the client supplied.
   */
  funding: {
    amount: number;
    symbol: string;
    decimals: number;
    mint: string;
    treasury: string;
    slots: number;
  };
}

/** A token resolved from a contract address, as the form displays it. */
export interface ResolvedToken {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl: string | null;
  decimalsVerifiedOnChain: boolean;
}

/* ------------------------------------------------------------------ fetch */

/**
 * Privy credentials for the console API routes.
 *
 * Extracted so both reads (`useAuthedGet`) and writes (`useCloseBag`) attach the same
 * headers. The access token identifies the user; the identity token additionally carries
 * the linked Solana wallet and is verified server-side against the app's JWKS.
 */
function useAuthedHeaders() {
  const { getAccessToken, identityToken } = useAuth();

  return useCallback(async (): Promise<Record<string, string>> => {
    const token = await getAccessToken();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
    };
  }, [getAccessToken, identityToken]);
}

/**
 * Authenticated JSON fetch for the console routes.
 *
 * These endpoints are all session-scoped server-side, so the browser has to send the
 * Privy access token (identity + wallet) exactly like `/api/profile` does. Without the
 * headers every one of them 401s — which is what the console did before this existed:
 * it called them anonymously and rendered "@bagworker / Trust 0 / $0 earned".
 */
function useAuthedGet() {
  const authedHeaders = useAuthedHeaders();

  return useCallback(
    async <T,>(url: string): Promise<T> => {
      const res = await fetch(url, {
        cache: "no-store",
        headers: await authedHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return res.json() as Promise<T>;
    },
    [authedHeaders],
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/* ------------------------------------------------------------------ hooks */

/** Platform-wide marketplace metrics — public, so it also powers the anonymous view. */
export function useOverview() {
  return useQuery<Overview>({
    queryKey: ["console", "overview"],
    queryFn: () => getJson<Overview>("/api/console/overview"),
  });
}

export function useConsolePayouts() {
  const authedGet = useAuthedGet();
  const { ready, authenticated } = useAuth();
  return useQuery<PayoutsPayload>({
    queryKey: ["console", "payouts"],
    enabled: ready && authenticated,
    queryFn: () => authedGet<PayoutsPayload>("/api/console/payouts"),
  });
}

export function useConsoleNotifications() {
  const authedGet = useAuthedGet();
  return useQuery<{ notifications: ConsoleNotification[] }>({
    // Anonymous visitors still get the public "new bag" items.
    queryKey: ["console", "notifications"],
    queryFn: () =>
      authedGet<{ notifications: ConsoleNotification[] }>(
        "/api/console/notifications",
      ),
    refetchInterval: 60_000,
  });
}

export function useConsoleProfile() {
  const authedGet = useAuthedGet();
  const { ready, authenticated } = useAuth();
  return useQuery<ProfilePayload>({
    queryKey: ["console", "profile"],
    enabled: ready && authenticated,
    queryFn: () => authedGet<ProfilePayload>("/api/console/profile"),
  });
}

/**
 * One ranked row of the console leaderboard.
 *
 * `points` is the number being ranked (the window's points, or lifetime for `overall`),
 * while `level` and `lifetimePoints` describe the profile itself — a strong week can win
 * the week without inventing a level.
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  handle: string | null;
  displayName: string | null;
  profileNumber: number | null;
  /** Null for accounts that predate the character builder. */
  character: CharacterConfig | null;
  avatarId: string | null;
  points: number;
  earned: number;
  settled: number;
  /** Weekly quests completed inside the window. */
  quests: number;
  level: number;
  lifetimePoints: number;
  /** True for the signed-in viewer's own row. */
  isYou: boolean;
}

export interface LeaderboardPayload {
  range: LeaderboardRange;
  /** ISO start of the window, or null for `overall`. */
  since: string | null;
  /** Bagworkers ranked in this window — may exceed `entries.length`. */
  total: number;
  entries: LeaderboardEntry[];
}

export function useConsoleLeaderboard(range: LeaderboardRange) {
  const authedGet = useAuthedGet();
  const { ready } = useAuth();

  return useQuery<LeaderboardPayload>({
    // One cache entry per range, so flicking between Daily and Monthly is instant after the
    // first read instead of re-fetching the board every time.
    queryKey: ["console", "leaderboard", range],
    // Not gated on `authenticated`: the board is public, and the only thing a session adds
    // is the `isYou` flag. Waiting for Privy to restore first avoids fetching twice.
    enabled: ready,
    queryFn: () =>
      authedGet<LeaderboardPayload>(`/api/console/leaderboard?range=${range}`),
    // Keep the previous range on screen while the next one loads, so switching tabs swaps
    // the numbers rather than collapsing the page into skeletons.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/* --------------------------------------------------------------- quests */

/**
 * One weekly quest, with this week's verified progress.
 *
 * `progressLabel` and `percent` are computed server-side from the same helpers the docs use, so
 * the "6,200 / 10,000 views" a Bagworker reads is the string the rule was written for — the
 * client never re-derives a number the server owns.
 */
export interface QuestProgressView {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** The metric progress was measured with; null when the row's metric is unrecognised. */
  metric: QuestMetric | null;
  target: number;
  reward: number;
  progress: number;
  status: "in_progress" | "completed";
  completedAt: string | null;
  /** Points credited for this week's completion. */
  pointsAwarded: number;
  percent: number;
  /** `2/3` or `6,200 / 10,000 views`. */
  progressLabel: string;
  counts: string;
  unit: string;
  action: string;
  href: string;
}

export interface QuestBoardPayload {
  period: {
    /** ISO week key, e.g. `2026-W36`. */
    key: string;
    startsAt: string;
    endsAt: string;
    label: string;
    daysRemaining: number;
    resetLabel: string;
  };
  quests: QuestProgressView[];
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    pointsEarned: number;
    pointsAvailable: number;
    rewardPerQuest: number;
  };
}

/**
 * The signed-in Bagworker's weekly quests.
 *
 * Reading this endpoint is also what advances progress — the server reconciles on every request —
 * so a 60 second refetch is enough to make the board feel live while a creator works, and it
 * self-heals anything a failed award left behind.
 */
export function useConsoleQuests() {
  const authedGet = useAuthedGet();
  const { ready, authenticated } = useAuth();

  return useQuery<QuestBoardPayload>({
    queryKey: ["console", "quests"],
    enabled: ready && authenticated,
    queryFn: () => authedGet<QuestBoardPayload>("/api/console/quests"),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}


export function useCreateBag() {
  const qc = useQueryClient();
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<CreateBagResult, Error, CreateBagInput>({
    mutationFn: async (input) => {
      const token = await getAccessToken();
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // The route resolves the publisher from a verified Privy token, so creating a bag
          // without one is rejected. (It used to accept anonymous writes.)
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create the bag");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/**
 * Activates a bag once the publisher's transfer has been sent.
 *
 * Separate from `useCreateBag` on purpose: a bag is only LIVE when money has moved, so
 * creating and funding are two steps with a wallet prompt between them. If signing fails or
 * is cancelled, the bag stays a draft rather than looking live with an empty treasury.
 */
export function useFundBag() {
  const qc = useQueryClient();
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<{ campaign: { id: string; status: string } }, Error, { id: string; txSignature: string }>({
    mutationFn: async ({ id, txSignature }) => {
      const token = await getAccessToken();
      const res = await fetch(`/api/campaigns/${id}/fund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify({ txSignature }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const error = new Error(
          body.error || "Could not activate the bag",
        ) as Error & { retryable?: boolean };
        // Carried through so the caller can tell "not confirmed yet" (poll again) apart from
        // "the transfer does not satisfy the bag" (never retry).
        error.retryable = body.retryable === true;
        throw error;
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/**
 * One of the two Bagwork treasury addresses, by kind.
 *
 * Fetched up front rather than read off a create response, because a flow has to show where the
 * money is going *before* the publisher commits to anything: the fixed-budget flow shows where
 * the funding transfer goes (FIXED), the flywheel flow shows where the token's fee recipient
 * must point (FEE). Public deposit addresses; only the address is returned, never the key.
 *
 * Defaults to FIXED so pre-existing callers keep resolving the budget wallet.
 */
export function useTreasuryAddress(kind: "FIXED" | "FEE" = "FIXED") {
  return useQuery<{ address: string | null; configured: boolean }>({
    queryKey: ["treasury", kind],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/treasury?kind=${kind.toLowerCase()}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 503 here means this treasury is unset, which is a real state worth rendering rather
        // than an error to retry.
        return { address: null, configured: false, error: body.error } as {
          address: string | null;
          configured: boolean;
        };
      }
      return body;
    },
  });
}

/**
 * Looks up a token by contract address.
 *
 * Run on demand rather than as a query, because it is a network round-trip to the chain and
 * the publisher only triggers it when they paste an address.
 */
export function useResolveToken() {
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<ResolvedToken, Error, string>({
    mutationFn: async (mint) => {
      const token = await getAccessToken();
      const res = await fetch(`/api/tokens/${mint.trim()}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not read that token");
      return body.token as ResolvedToken;
    },
  });
}

/** One row of the publisher's "My Bags" list. */
export interface MyBagRow {
  campaign: Campaign;
  submissionsCount: number;
  /** Distinct creators who have claimed a slot or posted. */
  creators: number;
  /** Claimed a slot but has not sent a link yet. */
  awaitingLink: number;
  /** Submissions awaiting a decision on this bag. */
  awaitingReview: number;
  /** Approved and still unpaid — the publisher's outstanding liability. */
  awaitingPayout: number;
  /** Approved, including those already paid — so this never reads 0 on a settled bag. */
  approved: number;
  rejected: number;
  /** The bag's community, or null when the publisher has not opened one yet. */
  communityId: string | null;
}

export interface MyBagsSummary {
  bags: number;
  live: number;
  ended: number;
  budgetCommitted: number;
  paidOut: number;
  remaining: number;
  submissions: number;
  creators: number;
  awaitingReview: number;
  awaitingPayout: number;
}

export interface MyBagsPayload {
  bags: MyBagRow[];
  summary: MyBagsSummary;
}

/**
 * The publisher's own bags.
 *
 * Authenticated and scoped server-side (`GET /api/campaigns?mine=1`), so a publisher can
 * only ever see the campaigns they funded. Before `Campaign.createdBy` existed there was
 * no way to ask this question at all.
 *
 * No `limit` is sent: the publisher payload caps itself (`take: 200`) and returns a
 * per-bag summary, so a client-side limit would be misleading.
 */
export function useMyBags() {
  const authedGet = useAuthedGet();
  const { ready, authenticated } = useAuth();
  return useQuery<MyBagsPayload>({
    queryKey: ["console", "my-bags"],
    enabled: ready && authenticated,
    queryFn: () => authedGet<MyBagsPayload>("/api/campaigns?mine=1&status=ALL"),
  });
}

/** Close a bag the signed-in publisher owns. */
export function useCloseBag() {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();
  return useMutation<{ campaign: Campaign }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
        body: JSON.stringify({ status: "ENDED" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not close the bag");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/**
 * Edits a bag's brief and artwork.
 *
 * The two things a publisher genuinely learns after launch — the audience they actually wanted, a
 * better banner — and the only two fields the API accepts here. Everything else on a bag is either
 * money (a budget moves only by a real transfer) or a lifecycle state with its own endpoint.
 *
 * Only the fields that changed are sent. The route reads `undefined` as "leave it alone" and `null`
 * as "clear it", so posting both on every save would wipe whichever one the publisher did not touch.
 */
export function useUpdateBag() {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();
  return useMutation<
    { campaign: Campaign },
    Error,
    { id: string; description?: string; bannerUrl?: string | null }
  >({
    mutationFn: async ({ id, ...patch }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save the changes");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      // The bag page reads `["campaign", id]`; the marketplace and the publisher's own list read
      // the others, and a renamed brief or a new banner has to show up in all three.
      qc.invalidateQueries({ queryKey: ["campaign", variables.id] });
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/**
 * Opens a Fee Redirect bag.
 *
 * The counterpart to `useCloseBag` and the flywheel's answer to `useFundBag`: there is no transfer
 * to verify, so this is the whole lifecycle transition — the publisher confirms it, and the bag goes
 * LIVE. The endpoint refuses it for any bag that is not `feeRedirectEnabled`, which is what keeps a
 * fixed-budget bag from being opened without its funding.
 */
export function usePublishFlywheelBag() {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();
  return useMutation<{ campaign: Campaign }, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
        body: JSON.stringify({ publish: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not publish this campaign");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
    },
  });
}

/* -------------------------------------------------------------- feature requests */

/**
 * A rejected post, carrying the field-level problems the route sent back.
 *
 * A plain `Error` would leave the composer with only one sentence and no idea which input to put it
 * under, and the useful case for a board is precisely that: "details are capped at 600 characters"
 * belongs under the textarea, not in a toast that disappears.
 */
export class FeatureRequestError extends Error {
  readonly errors?: FeatureDraftErrors;
  /** Set on a 409, so the composer can offer the twin that already exists. */
  readonly requestId?: string;

  constructor(message: string, options: { errors?: FeatureDraftErrors; requestId?: string } = {}) {
    super(message);
    this.name = "FeatureRequestError";
    this.errors = options.errors;
    this.requestId = options.requestId;
  }
}

/**
 * The board.
 *
 * Public, so this is not gated behind `authenticated`: a signed-out visitor sees the same list.
 * It still goes through the authenticated fetch, because *when* there is a session the identity
 * headers are what make `viewer.canPost` and each row's `hasVoted` meaningful — anonymous callers
 * simply send no headers and get an unvoted board.
 */
export function useFeatureBoard(sort: FeatureSort) {
  const authedGet = useAuthedGet();
  return useQuery<FeatureBoardPayload>({
    queryKey: ["features", sort],
    queryFn: () => authedGet<FeatureBoardPayload>(`/api/features?sort=${sort}`),
    /*
     * Switching between Top and New is a refetch, and the two lists share almost every row — so
     * the previous board stays on screen until the new one lands instead of the whole page
     * collapsing to a skeleton for a reorder. It is `keepPreviousData`, not a cache: the new
     * ordering still comes from the server, because ordering by a denormalised count is exactly
     * the kind of thing the client must not guess at.
     */
    placeholderData: keepPreviousData,
  });
}

/** File a new request. The server enforces the level gate; this is only the transport. */
export function useCreateFeatureRequest() {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();
  return useMutation<{ request: { id: string } }, FeatureRequestError, FeatureDraft>({
    mutationFn: async (draft) => {
      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          errors?: FeatureDraftErrors;
          requestId?: string;
        };
        throw new FeatureRequestError(body.error || "Could not post your feature request", {
          errors: body.errors,
          requestId: body.requestId,
        });
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["features"] }),
  });
}

/**
 * Upvote, or take the vote back.
 *
 * Applied optimistically, and that is not a flourish: this project's API round-trip is ~0.9s
 * against the remote pooler (see the note in `lib/auth/session.ts`), which is long enough that an
 * upvote button without an optimistic update feels broken and gets pressed twice. The count and the
 * button state move on press; the server's own tally replaces them on settle, so a vote that was
 * refused is corrected rather than left looking accepted.
 *
 * `voted` is sent explicitly rather than as "toggle me", so a retry of the same intent cannot flip
 * the vote back.
 */
export function useToggleFeatureVote() {
  const qc = useQueryClient();
  const authedHeaders = useAuthedHeaders();

  return useMutation<
    { upvotes: number; hasVoted: boolean },
    Error,
    { id: string; voted: boolean },
    { snapshots: [readonly unknown[], FeatureBoardPayload | undefined][] }
  >({
    mutationFn: async ({ id, voted }) => {
      const res = await fetch(`/api/features/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authedHeaders()) },
        body: JSON.stringify({ voted }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save your vote");
      }
      return res.json();
    },
    onMutate: async ({ id, voted }) => {
      // Stop an in-flight refetch from landing on top of the optimistic value.
      await qc.cancelQueries({ queryKey: ["features"] });
      const snapshots = qc.getQueriesData<FeatureBoardPayload>({ queryKey: ["features"] });

      qc.setQueriesData<FeatureBoardPayload>({ queryKey: ["features"] }, (current) => {
        if (!current) return current;
        const requests = current.requests.map((request) => {
          if (request.id !== id || request.hasVoted === voted) return request;
          return {
            ...request,
            hasVoted: voted,
            upvotes: Math.max(0, request.upvotes + (voted ? 1 : -1)),
          };
        });
        return {
          ...current,
          requests,
          summary: {
            ...current.summary,
            yourVotes: requests.filter((request) => request.hasVoted).length,
          },
        };
      });

      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      // Put every board back exactly as it was, so a refused vote cannot leave a phantom count.
      for (const [key, data] of context?.snapshots ?? []) qc.setQueryData(key, data);
    },
    // Either way, settle against the server: `upvotes` is denormalised, and the authoritative
    // number is the one the next reader of the board will see.
    onSettled: () => qc.invalidateQueries({ queryKey: ["features"] }),
  });
}

/* ------------------------------------------------------------------ launch-on-bagwork */

/**
 * The launch wizard's server contract.
 *
 * `LaunchCostEstimate` is imported with `import type`, which TypeScript erases entirely — so the
 * wizard can describe the server's shapes without the pump SDK (and its Anchor dependency) ending
 * up in the browser bundle. Declaring a second copy here would work too, and would drift.
 */
export interface BuiltLaunch {
  launchId: string;
  /**
   * The transactions to sign, in order.
   *
   * Two for a plain launch — create, then lock fees — and three when a dev buy was chosen, because
   * create + fee lock + buy serialise past Solana's 1232-byte packet limit and no single transaction
   * can carry them.
   */
  steps: BuiltLaunchStep[];
  /** The packet limit every step has already been measured against, for display and diagnostics. */
  maxStepBytes: number;
  /**
   * The bag this launch reserved, created **before** the launcher was asked to sign anything.
   *
   * `campaignUrl` is the same string the coin's metadata carries as its `website`, returned so the
   * form can show exactly where the coin will point at the moment it can still be seen — before the
   * first wallet prompt, and not after.
   */
  campaignId: string;
  campaignUrl: string;
  /** The wallet that must sign — the one the instructions were built for. */
  from: string;
  mint: string;
  treasury: string;
  metadataUri: string;
  chain: "solana:mainnet" | "solana:devnet";
  costs: LaunchCostEstimate;
  maxDevBuyBps: number;
}

/** What one step of a launch does. The UI names these; the order is load-bearing. */
export type LaunchStepKind = "create" | "devBuy" | "feeShare";

export interface BuiltLaunchStep {
  kind: LaunchStepKind;
  /** Base64 of the unsigned transaction, exactly as the server serialised it. */
  transaction: string;
  /** Serialised size in bytes, already guaranteed to be within `maxStepBytes`. */
  bytes: number;
}

/**
 * The fee-lock transaction on its own, for a coin that already exists.
 *
 * Returned by `/api/launches/lock`, which is how a launch that created its coin but failed to lock
 * fees finishes: the whole launch cannot be rebuilt, because `create_v2` would be asked to mint a
 * coin that is already on-chain.
 */
export interface BuiltFeeLock {
  launchId: string;
  mint: string;
  treasury: string;
  /** Base64 of the unsigned transaction. */
  transaction: string;
  bytes: number;
  maxStepBytes: number;
}

export interface SubmittedLaunch {
  launchId: string;
  mint: string;
  campaign: Campaign;
  feeLock: { treasury: string; shareBps: number; adminRevoked: boolean };
  campaignId?: string;
  redirectUrl?: string;
  alreadyVerified?: boolean;
  /**
   * True when the coin was created and its fees locked, but the launcher's own dev buy did not land.
   *
   * Not a launch failure — the bag is funded by the coin's fees, not by the buy — but it is money the
   * launcher expected to spend and did not, so it is reported rather than swallowed.
   */
  devBuyFailed?: boolean;
}

/**
 * Prices a dev buy against the live bonding curve.
 *
 * A mutation rather than a query because it is a POST that runs on demand as the launcher moves the
 * dev-buy slider, not a cacheable resource — and because it is the server that must do the curve
 * maths, so the browser never has to know how a pump curve is shaped.
 */
export function useLaunchQuote() {
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<{ costs: LaunchCostEstimate; maxDevBuyBps: number }, Error, number>({
    mutationFn: async (devBuySol) => {
      const token = await getAccessToken();
      const res = await fetch("/api/launches/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify({ devBuySol }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not price this launch");
      return body;
    },
  });
}

/**
 * Builds the unsigned launch transaction. Nothing is signed here.
 *
 * `mint` is generated by the caller and passed in, because `create_v2` requires the new mint's own
 * signature and the key must never leave the browser.
 */
export function useBuildLaunch() {
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<BuiltLaunch, Error, LaunchDraft & { wallet: string; mint: string }>({
    mutationFn: async (input) => {
      const token = await getAccessToken();
      const res = await fetch("/api/launches/build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      // The route's refusals are the interesting part — a cap breach and a failing simulation are
      // both surfaced as the reason rather than as a generic failure.
      if (!res.ok) throw new Error(body.error || "Could not build the launch");
      return body as BuiltLaunch;
    },
  });
}

/**
 * Records a signed launch: verifies both transactions on-chain and creates the bag.
 *
 * Kept separate from the build because wallet prompts sit between them, and a launch that was signed
 * but not yet confirmed is a real state the wizard has to be able to show. Both signatures are sent
 * together: the route reads each off the chain, and a missing fee-lock signature means the lock was
 * never sent, which is not a launch this product can turn into a bag.
 */
export function useSubmitLaunch() {
  const qc = useQueryClient();
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<
    SubmittedLaunch,
    Error,
    { launchId: string; signature: string; feeShareSignature: string; devBuySignature?: string } & LaunchDraft
  >({
    mutationFn: async (input) => {
      const token = await getAccessToken();
      const res = await fetch("/api/launches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        /*
         * Three flags, because they mean three different things to the wizard. `retryable` is the
         * transaction merely not being visible yet, which resolves itself. `coinCreated` +
         * `feeLockFailed` is the half-done launch — a live coin whose fees are not locked — which is
         * recoverable by retrying the lock and must not read as "nothing happened".
         */
        const error = new Error(body.error || "Could not verify the launch") as Error & {
          retryable?: boolean;
          coinCreated?: boolean;
          feeLockFailed?: boolean;
        };
        error.retryable = body.retryable === true;
        error.coinCreated = body.coinCreated === true;
        error.feeLockFailed = body.feeLockFailed === true;
        throw error;
      }
      return body as SubmittedLaunch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      qc.invalidateQueries({ queryKey: ["console"] });
      qc.invalidateQueries({ queryKey: ["my-bags"] });
    },
  });
}

/**
 * Rebuilds the fee-lock transaction for a launch whose coin already exists.
 *
 * The retry half of the two-step launch. Reached only when the create succeeded and the lock did not
 * — a rejected prompt, a stale blockhash, a dropped transaction — and it exists so the fix is to
 * sign that one transaction again rather than to start over, which would ask `create_v2` to mint a
 * coin that is already on-chain.
 */
export function useLockLaunch() {
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<BuiltFeeLock, Error, { launchId: string }>({
    mutationFn: async (input) => {
      const token = await getAccessToken();
      const res = await fetch("/api/launches/lock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not rebuild the fee lock");
      return body as BuiltFeeLock;
    },
  });
}

/**
 * Asks the server whether one launch step actually succeeded on-chain.
 *
 * Called between steps rather than once at the end, because the answer changes what happens next: a
 * create that failed means there is no coin to lock, a dev buy that failed means the launch can still
 * finish without it, and a fee lock that failed is the one case the retry path exists for.
 */
export function useCheckLaunchStep() {
  const { getAccessToken, identityToken } = useAuth();
  return useMutation<
    { status: "confirmed" | "failed" | "pending"; error?: string },
    Error,
    { signature: string }
  >({
    mutationFn: async (input) => {
      const token = await getAccessToken();
      const res = await fetch("/api/launches/step", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(identityToken ? { "X-Privy-Identity-Token": identityToken } : {}),
        },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      // Being unable to *ask* is not a failed step: the caller polls again and the chain decides.
      if (!res.ok) return { status: "pending" as const };
      return body as { status: "confirmed" | "failed" | "pending"; error?: string };
    },
  });
}

/** Whether this deployment can launch a coin, and why not when it cannot. */
export interface LaunchAvailability {
  enabled: boolean;
  reason: string | null;
  treasury: string | null;
  maxDevBuyBps: number;
}

/**
 * The launch page's readiness check.
 *
 * Fetched once on mount so the page can put the enable-flag refusal at the *top*, where it is read
 * before a form is filled in, rather than only at the wallet prompt where the build route would
 * otherwise deliver it. `enabled: false` is not an error state — it is the flag defaulting to off on
 * a deployment that has not been through a devnet run — so a failed request resolves to "unknown",
 * which the page treats as "not confirmed launchable" and disables the CTA for.
 */
export function useLaunchAvailability() {
  return useQuery<LaunchAvailability>({
    queryKey: ["launch", "availability"],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/launches/availability", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not check whether launching is available");
      return (await res.json()) as LaunchAvailability;
    },
  });
}

/** The response shape of `GET /api/wallet/balance`. */
export interface WalletBalance {
  address: string;
  cluster: "devnet" | "mainnet-beta";
  /** SOL, or `null` when every RPC provider failed. */
  balanceSol: number | null;
}

/**
 * Native SOL for the connected wallet — what the console header chip shows.
 *
 * Read through `/api/wallet/balance`, so the RPC key stays on the server and the header never talks
 * to a node directly. The address is the query key, which is what makes a wallet change (a
 * reconnect, or a second wallet linked from the profile) re-fetch immediately rather than showing
 * the previous wallet's balance. A 20-second `staleTime` is the "cache briefly" half: navigating
 * between console pages re-uses the value, and only a genuinely old read goes back to RPC. Focus
 * refetching is off so alt-tabbing does not spend a credit.
 */
export function useSolanaBalance(address: string | null | undefined) {
  return useQuery<WalletBalance>({
    queryKey: ["wallet-balance", address ?? ""],
    enabled: Boolean(address),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch(
        `/api/wallet/balance?address=${encodeURIComponent(String(address))}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("Could not load the wallet balance");
      return (await res.json()) as WalletBalance;
    },
  });
}


