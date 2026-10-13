import { db } from "@/lib/db";
import { ReviewConflict, reviewSubmission } from "@/lib/review-engine";

/**
 * The batch review run.
 *
 * Manual by design, and the only way review happens at all: an operator presses **Run review** on
 * the review desk, this module walks a bounded slice of the pending queue through the same
 * `reviewSubmission` every other path uses, and nothing here ever runs on its own. There is no
 * cron for it and no trigger on submit — a submission lands `pending` and stays there until a
 * person decides to spend the model calls.
 *
 * Three rules it inherits from the engine, and one of its own:
 *
 *   1. **A verdict requires a model.** An item the engine could not score comes back `pending` and
 *      is counted as *skipped* here. Nothing in this file approves anything on a heuristic, and a
 *      model outage cannot turn into a wall of approvals.
 *   2. **One item's failure is not the batch's failure.** Engine errors are caught per item, the
 *      run continues, and the operator gets the reason on that row.
 *   3. **The batch never pays.** Every call passes `{ settle: false }`, so an approval writes the
 *      verdict and the amount and stops. Money moves through `Pay creators` (`/api/admin/pay`) or
 *      the daily payout sweep, where the amount and destination are visible before anything is
 *      sent. A bulk pass is not the place to discover a treasury is misconfigured.
 *
 * Sequencing is deliberate: one model call at a time. Parallel scoring would multiply the run's
 * rate-limit risk to save seconds on a queue the operator is looking at anyway.
 *
 * Callers own authorisation, the enable flag and the single-flight lock (see
 * `POST /api/admin/review/batch`); this module owns the work.
 */

/** How many pending rows a run takes when the operator did not ask for a size. */
export const BATCH_REVIEW_DEFAULT_LIMIT = 20;

/**
 * The hard ceiling.
 *
 * A run is a sequence of model calls inside one HTTP invocation, so the cap is what keeps a batch
 * inside the route's time budget and inside a sane spend. Fifty at a few seconds each is the most
 * that reliably finishes; anything larger is two batches, not one long request.
 */
export const BATCH_REVIEW_MAX_LIMIT = 50;

/** Statuses a batch may touch. `reviewing` is here because a killed run can strand rows there. */
const REVIEWABLE_STATUSES = ["pending", "reviewing"];

export type BatchItemOutcome = "approved" | "rejected" | "skipped" | "failed";

export interface BatchItemResult {
  id: string;
  campaignTitle: string;
  platform: string;
  outcome: BatchItemOutcome;
  /** Status after the run — `pending` for anything that got no verdict. */
  status: string;
  qualityScore: number;
  authenticityScore: number;
  payoutAmount: number;
  /** Why, for the operator. Carries the engine's own note on a skip. */
  note: string;
}

export interface BatchRunResult {
  /** Rows the run actually looked at (excluding requested ids that were not eligible). */
  examined: number;
  /** Items that reached a verdict: `approved + rejected`. */
  reviewed: number;
  approved: number;
  rejected: number;
  /** No verdict reached — deferred by the engine, so they stay `pending`. */
  skipped: number;
  /** The run itself errored on them. They stay `pending` too. */
  failed: number;
  /** The cap applied to this run. */
  limit: number;
  /** How many ids the caller asked for, when it asked for specific ones. */
  requested: number | null;
  durationMs: number;
  results: BatchItemResult[];
}

/** Short, single-line reason from an unknown throwable. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Reviews up to `limit` pending submissions and returns what happened to each.
 *
 * `submissionIds`, when given, narrows the run to those rows — and only the ones still awaiting
 * review. A selected row that has since been approved by hand is reported as skipped rather than
 * silently dropped, because "I selected five and it says four" is a mystery an operator should
 * never have to solve.
 */
export async function runBatchReview(input: {
  submissionIds?: string[];
  limit?: number;
}): Promise<BatchRunResult> {
  const startedAt = Date.now();
  const limit = Math.min(
    Math.max(Math.trunc(input.limit ?? BATCH_REVIEW_DEFAULT_LIMIT) || BATCH_REVIEW_DEFAULT_LIMIT, 1),
    BATCH_REVIEW_MAX_LIMIT,
  );
  const requestedIds = input.submissionIds?.length ? [...new Set(input.submissionIds)] : null;

  const candidates = await db.submission.findMany({
    where: {
      status: { in: REVIEWABLE_STATUSES },
      ...(requestedIds ? { id: { in: requestedIds } } : {}),
    },
    // Oldest first: the queue drains in the order creators submitted, so nobody is starved by a
    // busy bag taking the whole batch every time.
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      platform: true,
      campaign: { select: { title: true } },
    },
  });

  const results: BatchItemResult[] = [];
  const examinedIds = new Set(candidates.map((row) => row.id));

  /*
   * Selected rows that were not eligible, reported rather than dropped.
   *
   * They are read back in one query so the note can say *what* they are now ("this submission is
   * approved"), which is the difference between a result an operator trusts and one they have to
   * go and check by hand.
   */
  if (requestedIds) {
    const missed = requestedIds.filter((id) => !examinedIds.has(id));
    if (missed.length) {
      const rows = await db.submission.findMany({
        where: { id: { in: missed } },
        select: { id: true, status: true, platform: true, campaign: { select: { title: true } } },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const id of missed) {
        const row = byId.get(id);
        results.push({
          id,
          campaignTitle: row?.campaign.title ?? "Unknown bag",
          platform: row?.platform ?? "—",
          outcome: "skipped",
          status: row?.status ?? "missing",
          qualityScore: 0,
          authenticityScore: 0,
          payoutAmount: 0,
          note: row
            ? `Left alone: this submission is ${row.status}, not awaiting review.`
            : "Left alone: no submission with that id.",
        });
      }
    }
  }

  for (const row of candidates) {
    try {
      /*
       * `settle: false` is the rule this module exists to enforce. An approval here records the
       * verdict and the amount; it does not move money.
       */
      const outcome = await reviewSubmission(row.id, { settle: false });
      results.push({
        id: row.id,
        campaignTitle: row.campaign.title,
        platform: row.platform,
        outcome: outcome.awaitingReview ? "skipped" : outcome.approved ? "approved" : "rejected",
        status: outcome.status,
        qualityScore: outcome.qualityScore,
        authenticityScore: outcome.authenticityScore,
        payoutAmount: outcome.payoutAmount,
        note: outcome.reviewNote,
      });
    } catch (error) {
      /*
       * A conflict is an ordinary answer, not a failure: the row was claimed (no link to read) or
       * was decided between the query above and this call. Either way it is left exactly as it is,
       * which is also why the engine refuses to score it rather than guessing.
       */
      if (error instanceof ReviewConflict) {
        results.push({
          id: row.id,
          campaignTitle: row.campaign.title,
          platform: row.platform,
          outcome: "skipped",
          status: "pending",
          qualityScore: 0,
          authenticityScore: 0,
          payoutAmount: 0,
          note: `Left alone: ${error.message}`,
        });
        continue;
      }
      console.error(`[review/batch] ${row.id} failed`, error);
      results.push({
        id: row.id,
        campaignTitle: row.campaign.title,
        platform: row.platform,
        outcome: "failed",
        status: "pending",
        qualityScore: 0,
        authenticityScore: 0,
        payoutAmount: 0,
        note: `The run errored on this submission: ${reasonOf(error)}`,
      });
    }
  }

  const count = (outcome: BatchItemOutcome) =>
    results.filter((item) => item.outcome === outcome).length;
  const approved = count("approved");
  const rejected = count("rejected");

  return {
    examined: candidates.length,
    reviewed: approved + rejected,
    approved,
    rejected,
    skipped: count("skipped"),
    failed: count("failed"),
    limit,
    requested: requestedIds?.length ?? null,
    durationMs: Date.now() - startedAt,
    results,
  };
}
