import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { veniceJson } from "@/lib/ai/venice";
import {
  settleApprovedSubmission,
  type PayoutSettleOutcome,
} from "@/lib/payouts/settle";
import { fetchPostContent, type PostContent } from "@/lib/review/post-content";
import { syncWeeklyQuestsSafely } from "@/lib/quests/engine";

/**
 * The review engine — the only place a submission's verdict is decided.
 *
 * It scores against the *campaign's actual brief*: its description, content type, platform list and
 * token, plus the post's real text and engagement — not a generic heuristic.
 *
 * Three rules hold this together, and the previous version broke all three:
 *
 *   1. **A verdict requires a model.** There is no heuristic fallback. If Venice is unconfigured,
 *      unreachable, slow, or returns something unparseable, the submission stays `pending` and a
 *      human decides. The old fallback scored 60/100 for any URL containing "status" and approved
 *      everything while the model was missing — which was always.
 *   2. **The post's content is required too.** A model asked to judge a bare URL has nothing to
 *      judge, so a post whose text cannot be fetched also stays pending.
 *   3. **The model's own verdict is binding.** Scores alone never approve: `verdict: "reject"` is a
 *      rejection even when both numbers clear their gates.
 *
 * Callers own authorisation; this module owns content fetching, scoring, the verdict, slot
 * accounting and the write.
 */

const QUALITY_GATE = 55;
const AUTHENTICITY_GATE = 50;

export interface ReviewOutcome {
  submissionId: string;
  approved: boolean;
  /**
   * `pending` means **no verdict was reached** — the post could not be read, or the model could not
   * be reached — so the submission was left for a human rather than decided by a formula.
   */
  status: "approved" | "rejected" | "pending";
  /** True when the submission was left awaiting review instead of being decided. */
  awaitingReview: boolean;
  qualityScore: number;
  authenticityScore: number;
  payoutAmount: number;
  /** False when the model scored without engagement figures to check it against. */
  authenticityVerified: boolean;
  llmUsed: boolean;
  /** The Venice model that produced the verdict, for the audit trail. */
  model: string | null;
  reviewNote: string;
  /**
   * What the automatic payout did with this approval: `paid` (sent and confirmed on-chain), or
   * `pending`/`blocked` with the reason. Null for rejections and deferrals — nothing was owed.
   */
  payout: PayoutSettleOutcome | null;
  /**
   * Whether this call was allowed to attempt the automatic payout at all.
   *
   * False only when the caller opted out (`reviewSubmission(id, { settle: false })`), which is what
   * the admin batch review does: a batch is a scoring pass, and money must keep moving through the
   * one path an operator can see and confirm. Without this flag an approval with `payout: null`
   * would be ambiguous — it could mean "not attempted" or "owed but deferred", and those are
   * different things to whoever reads the result.
   */
  settleAttempted: boolean;
}

/* ------------------------------------------------------------------ helpers */

/** What the model must return. Deliberately tiny: short keys, short reason, no prose. */
interface VeniceVerdict {
  /** Relevance to the brief and content quality, 0-100. */
  q?: unknown;
  /** Authenticity: off-topic, bot-like or recycled content scores low. */
  a?: unknown;
  reason?: unknown;
  verdict?: unknown;
}

/** The whole instruction. A handful of tokens, and it never grows with the campaign. */
const SYSTEM_PROMPT =
  "You review social posts submitted to a crypto campaign. Reply with JSON only, no prose: " +
  '{"q":<0-100>,"a":<0-100>,"reason":"<max 14 words>","verdict":"approve"|"reject"}. ' +
  "q = relevance to the brief and content quality. a = authenticity (off-topic, spam, bot-like or " +
  "recycled content scores low). Reject when the post is off-topic, empty, spam, or omits the token " +
  "or project the brief requires.";

/** The campaign's rules, compactly — only what the check actually needs. */
function campaignBrief(campaign: {
  title: string;
  description: string | null;
  contentType: string;
  /** Prisma stores this as a Json column, so it arrives as JsonValue and is narrowed here. */
  platforms: unknown;
  project: { tokenSymbol: string; name: string };
}): string {
  const platforms = Array.isArray(campaign.platforms)
    ? campaign.platforms.filter((p): p is string => typeof p === "string")
    : [];
  return [
    `brief: ${campaign.title}`,
    campaign.description ? `details: ${campaign.description.slice(0, 400)}` : "",
    `token: ${campaign.project.tokenSymbol} (${campaign.project.name})`,
    `content type: ${campaign.contentType}`,
    platforms.length ? `allowed platforms: ${platforms.join(", ")}` : "platforms: any",
  ]
    .filter(Boolean)
    .join("\n");
}

/** The post itself, capped so a long thread cannot inflate the prompt. */
function postContext(sub: { platform: string; postUrl: string }, post: PostContent): string {
  const { views, likes, reposts } = post.metrics;
  return [
    `platform: ${sub.platform}`,
    post.author ? `author: @${post.author}` : "",
    `post: ${post.text.slice(0, 700)}`,
    views !== null
      ? `engagement: ${views} views, ${likes ?? "?"} likes, ${reposts ?? "?"} reposts`
      : "engagement: not published",
    post.hasMedia ? "has media" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(
  campaign: Parameters<typeof campaignBrief>[0],
  sub: { platform: string; postUrl: string },
  post: PostContent,
): string {
  return `CAMPAIGN\n${campaignBrief(campaign)}\n\nSUBMISSION\n${postContext(sub, post)}`;
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function computeAuthenticity(
  views: number,
  likeRatio: number,
  repostRatio: number,
): number {
  // Organic engagement: likes/views between 1.5% and 9% is healthy.
  let score = 50;
  if (views < 50) score -= 30; // too few views, possibly fresh/bot
  if (likeRatio >= 0.015 && likeRatio <= 0.09) score += 35;
  else if (likeRatio > 0.09 && likeRatio <= 0.2) score += 15;
  else if (likeRatio > 0.4) score -= 40; // suspiciously high → bot likes
  else if (likeRatio < 0.005) score -= 25; // dead engagement
  if (repostRatio > 0 && repostRatio <= 0.05) score += 10;
  if (repostRatio > 0.1) score -= 20;
  // Deliberately deterministic: no random jitter. An anti-slop score that changes between
  // two identical runs is impossible to audit or to appeal.
  return clampInt(score, 0, 100);
}

/* ------------------------------------------------------------------ classes */

/** The submission does not exist. */
export class ReviewNotFound extends Error {
  constructor() {
    super("Submission not found");
    this.name = "ReviewNotFound";
  }
}

/** The submission is past review (already approved, rejected or paid). */
export class ReviewConflict extends Error {
  constructor(public readonly status: string) {
    super(`Submission already ${status}`);
    this.name = "ReviewConflict";
  }
}

/* ------------------------------------------------------------------ engine */

/**
 * Scores the submission, decides the verdict, and persists the result.
 *
 * `settle` exists for exactly one caller: the admin batch review. Approving anywhere else means
 * "pay this", and the automatic payout runs from the campaign's own treasury. A batch is a bulk
 * scoring pass, so it opts out and leaves the money to `Pay creators` — the path where an operator
 * sees the amount, the destination and the signature before anything moves. Default is `true`, so
 * the creator path and the single-item admin action are unchanged.
 */
export async function reviewSubmission(
  submissionId: string,
  options: { settle?: boolean } = {},
): Promise<ReviewOutcome> {
  const settle = options.settle ?? true;
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    include: { campaign: { include: { project: true } } },
  });
  if (!sub) throw new ReviewNotFound();
  if (sub.status !== "pending" && sub.status !== "reviewing") {
    throw new ReviewConflict(sub.status);
  }
  // A claim has no link yet, so there is nothing to review and no content to judge.
  // Without this the empty-string URL would flow into the heuristics and score a post
  // that does not exist.
  if (!sub.postUrl) throw new ReviewConflict("claimed");
  // Rebuilt with a non-null `postUrl` so the helpers below — which are typed against a real
  // link — take the narrowed value rather than re-deriving it.
  const submitted = { ...sub, postUrl: sub.postUrl };

  await db.submission.update({
    where: { id: submissionId },
    data: { status: "reviewing" },
  });

  const campaign = sub.campaign;

  /*
   * ---- Step 1: the post's real content ----
   *
   * Review reads the post, not the link. A model handed only `https://x.com/user/status/123` has
   * nothing to judge, and that is precisely how a "review" can end up approving anything at all.
   */
  const post = await fetchPostContent(submitted.postUrl, sub.platform);

  /**
   * Leaves the submission in review and says why.
   *
   * The only outcome available when review cannot run: no scores, no payout, no verdict. Every
   * failure path below funnels through here rather than inventing a decision.
   */
  async function defer(reason: string, detail?: unknown): Promise<ReviewOutcome> {
    console.error(`[review-engine] ${reason} (submission ${submissionId})`, detail ?? "");
    const note = `${reason} It stays in review and a reviewer will decide it — no verdict was reached automatically.`;
    await db.submission.update({
      where: { id: submissionId },
      data: {
        status: "pending",
        reviewNote: note,
        payoutAmount: null,
        qualityScore: 0,
        authenticityScore: 0,
        approvedAt: null,
      },
    });
    await syncWeeklyQuestsSafely(submitted.userId, `review deferred for submission ${submissionId}`).catch(
      () => {},
    );
    return {
      submissionId,
      approved: false,
      status: "pending",
      awaitingReview: true,
      qualityScore: 0,
      authenticityScore: 0,
      payoutAmount: 0,
      authenticityVerified: false,
      llmUsed: false,
      model: null,
      reviewNote: note,
      // No verdict, so nothing was owed and no payout was attempted.
      payout: null,
      settleAttempted: false,
    };
  }

  if (!post) {
    return defer(
      `Could not load the post content from ${sub.platform}, so there is nothing to review.`,
    );
  }

  /*
   * ---- Step 2: the model's verdict, against the campaign brief ----
   *
   * Every failure — no key, no model, HTTP error, timeout, unparseable JSON — lands in the same
   * place: the submission stays in review. Silence is never an approval.
   */
  let verdict: VeniceVerdict;
  let model: string | null = null;
  let usage: { prompt?: number; completion?: number; total?: number } | undefined;

  try {
    const result = await veniceJson<VeniceVerdict>(
      SYSTEM_PROMPT,
      buildPrompt(campaign, submitted, post),
      160,
    );
    verdict = result.data;
    model = result.model;
    usage = result.usage;
  } catch (error) {
    return defer("The review model could not be reached, so this has not been scored.", error);
  }

  const qualityScore = clampInt(verdict.q, 0, 100);
  const modelAuthenticity = clampInt(verdict.a, 0, 100);

  /*
   * Published engagement, when the platform gives it, is blended into the model's authenticity read
   * — a cross-check on the model, not a substitute for it. Where a platform publishes no figures
   * (the oEmbed sources), the model's number stands alone rather than being padded to a midpoint.
   */
  const views = post.metrics.views;
  const hasEngagementData = views !== null;
  const likeRatio = views && views > 0 ? (post.metrics.likes ?? 0) / views : 0;
  const repostRatio = views && views > 0 ? (post.metrics.reposts ?? 0) / views : 0;
  const authenticityScore = clampInt(
    hasEngagementData
      ? Math.round(modelAuthenticity * 0.6 + computeAuthenticity(views ?? 0, likeRatio, repostRatio) * 0.4)
      : modelAuthenticity,
    0,
    100,
  );

  /** The model's own word is binding: a rejected verdict is a rejection even when scores clear. */
  const modelApproved = verdict.verdict === "approve";
  let reviewNote = typeof verdict.reason === "string" ? verdict.reason.slice(0, 200) : "";
  const llmUsed = true;
  const aiAnalysis = {
    model,
    usage,
    verdict,
    post: { source: post.source, author: post.author, metrics: post.metrics },
  } as unknown as Prisma.InputJsonValue;
  // ---- Step 3: verdict + payout computation ----
  /*
   * Payout is computed from the engagement the platform actually published, not from the row's own
   * counters — those start at zero and nothing else ever filled them in. `effectiveViews` is what
   * gets persisted below, so the row and the payout agree from here on.
   */
  const effectiveViews = post.metrics.views ?? sub.views;
  const approved =
    modelApproved && qualityScore >= QUALITY_GATE && authenticityScore >= AUTHENTICITY_GATE;
  let payoutAmount: number | null = null;
  const newStatus: "approved" | "rejected" = approved ? "approved" : "rejected";

  if (approved) {
    if (campaign.paymentModel === "HYBRID") {
      // Flat fee plus reach. The flat part is paid either way so an approved post is never
      // worth $0 while its view counts are still being verified; `maxPayout` remains the
      // per-post ceiling.
      const base = campaign.fixedFee ?? 0;
      const perReach = hasEngagementData ? (effectiveViews / 1000) * campaign.ratePer1k : 0;
      payoutAmount = Math.min(base + perReach, campaign.maxPayout);
    } else if (campaign.rateType === "DYNAMIC") {
      if (hasEngagementData) {
        payoutAmount = Math.min((effectiveViews / 1000) * campaign.ratePer1k, campaign.maxPayout);
      } else {
        // No verified views yet, so a per-1K rate would compute $0 and an approved
        // submission would be worth nothing. Pay the fixed component and say so; the
        // dynamic top-up lands when metrics arrive.
        payoutAmount = campaign.ratePer1k;
      }
    } else {
      // Fixed payout scaled by quality score.
      payoutAmount = Math.round(campaign.maxPayout * (qualityScore / 100) * 100) / 100;
    }
    payoutAmount = Math.round(payoutAmount * 100) / 100;
    reviewNote =
      (reviewNote ? reviewNote + " " : "") +
      `Approved. Quality ${qualityScore}/100, authenticity ${authenticityScore}/100${
        hasEngagementData
          ? "."
          : " (engagement not verified yet — scored on content quality alone)."
      } Payout computed: $${payoutAmount}.`;
  } else {
    reviewNote =
      (reviewNote ? reviewNote + " " : "") +
      `Rejected. Quality ${qualityScore}/100 (need ${QUALITY_GATE}), authenticity ${authenticityScore}/100 (need ${AUTHENTICITY_GATE}). Anti-slop engine flagged this submission.`;
  }

  await db.submission.update({
    where: { id: submissionId },
    data: {
      status: newStatus,
      qualityScore,
      authenticityScore,
      payoutAmount,
      reviewNote,
      /**
       * The week this submission's views belong to.
       *
       * Stamped on approval and cleared on rejection, so the "View Hunter" quest can sum verified
       * views per week without trusting `updatedAt` (which moves for any write at all).
       */
      approvedAt: approved ? new Date() : null,
      /*
       * The engagement the platform actually published, recorded on the row. Until review fetched
       * the post, these stayed at zero forever — which is why every payout fell back to its fixed
       * component and why authenticity had no real numbers to check.
       */
      views: effectiveViews,
      likes: post.metrics.likes ?? sub.likes,
      reposts: post.metrics.reposts ?? sub.reposts,
      aiAnalysis,
    },
  });

  // A rejected submission gives its slot back.
  //
  // Creating a submission consumes a slot (correct — two creators must not both occupy the
  // last one while review is pending), but a rejection means the bag never got the content.
  // Holding the slot forever silently shrank every campaign: twenty rejections closed a
  // twenty-slot bag.
  if (newStatus === "rejected") {
    await db.campaign
      .update({
        where: { id: sub.campaignId },
        data: { slotsRemaining: { increment: 1 } },
      })
      .catch(() => {});
  }

  /**
   * An approval is where the "View Hunter" quest gets its views, so the weekly board is brought
   * up to date here — the review engine is the only place a verdict is decided, so both the
   * creator path and the admin console end up counting the same way.
   *
   * Failures are logged, not thrown: the verdict is already stored, and derived progress means
   * the next sync recomputes the same number.
   */
  await syncWeeklyQuestsSafely(sub.userId, `review verdict for submission ${submissionId}`);

  /*
   * An approval is money owed, so the automatic payout runs here — server-side, from the
   * campaign's own treasury, never through a client signature.
   *
   * The verdict is already stored when this runs, and the outcome is reported rather than
   * thrown: a payout that cannot be sent yet (empty treasury, no creator wallet, a wallet that
   * must be migrated) is a `blocked` reason the caller surfaces, the submission stays
   * `approved`, and the daily sweep retries it. Nothing about a failed payout can unpick an
   * approval, and nothing about approving waits on a human.
   *
   * Skipped entirely when the caller passed `settle: false` — the batch review approves a queue
   * without touching money, and `settleAttempted` below is how that reads in the result.
   */
  let payout: PayoutSettleOutcome | null = null;
  if (newStatus === "approved" && settle) {
    payout = await settleApprovedSubmission(submissionId, "review").catch((error) => ({
      status: "pending" as const,
      submissionId,
      reason:
        error instanceof Error ? error.message : "The automatic payout attempt failed",
    }));
  }

  return {
    submissionId,
    approved,
    status: newStatus,
    qualityScore,
    authenticityScore,
    payoutAmount: payoutAmount ?? 0,
    authenticityVerified: hasEngagementData,
    llmUsed,
    model,
    awaitingReview: false,
    reviewNote,
    /** What the automatic payout did: `paid`, or `pending`/`blocked` with the reason. */
    payout,
    /** False only for a caller that opted out — see the option's note on this function. */
    settleAttempted: settle && newStatus === "approved",
  };
}
