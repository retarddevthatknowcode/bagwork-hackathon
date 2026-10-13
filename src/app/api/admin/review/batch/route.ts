import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../../login/route";
import { runBatchReview } from "@/lib/review/batch";
import {
  claimBatchRunLock,
  describeBatchRunHolder,
  getBatchReviewEnabled,
  releaseBatchRunLock,
} from "@/lib/settings/platform";

export const dynamic = "force-dynamic";

/*
 * A batch is a sequence of model calls — content fetch, then a verdict, per submission — so it
 * needs room well beyond the default timeout even at the twenty-item default.
 */
export const maxDuration = 300;

/**
 * POST /api/admin/review/batch — score a batch of pending submissions, on demand.
 *
 * The only entry point to review in the product. It runs when an operator presses **Run review**,
 * and at no other time: there is no cron for it, and `POST /api/submissions` deliberately leaves
 * every new link `pending` so this queue is always the decision point.
 *
 * Body (both optional): `{ submissionIds?: string[], limit?: number }`
 *   - no body            → the oldest pending submissions, up to the default cap
 *   - `submissionIds`    → only those rows, and only while they are still awaiting review
 *   - `limit`            → clamped to 1…50 by `runBatchReview`
 *
 * Fail-closed at every step, in this order:
 *
 *   1. **Auth** — the admin cookie, or 401. No session, no batch.
 *   2. **The enable flag** — off → 403 with the reason. The flag is *state an operator set*, not a
 *      value this route can assume, so a disabled engine cannot be run by a direct API call.
 *   3. **The single-flight lock** — one run at a time, or 409. Claimed with a conditional update,
 *      so a double-click cannot start two runs over the same queue (which would score everything
 *      twice and burn the model budget twice for one result).
 *
 * The lock is released in `finally`, and only by the run that holds it — a run that overran the
 * TTL cannot clear a newer run's claim on its way out.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await getBatchReviewEnabled())) {
    return NextResponse.json(
      {
        error:
          "Batch review is off. Turn it on in the review desk before running a batch.",
        code: "batch_review_disabled",
      },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const rawIds = body?.submissionIds;
  if (rawIds !== undefined && !Array.isArray(rawIds)) {
    return NextResponse.json(
      { error: "submissionIds must be an array of submission ids" },
      { status: 400 },
    );
  }
  const submissionIds = Array.isArray(rawIds)
    ? rawIds.map((id: unknown) => String(id)).filter(Boolean)
    : undefined;

  const parsedLimit = Number(body?.limit);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;

  const lock = await claimBatchRunLock();
  if (!lock) {
    const holder = await describeBatchRunHolder();
    return NextResponse.json(
      {
        error: holder
          ? `A batch review is already running (started ${holder.lockedAt}). Wait for it to finish — a run older than the lock TTL can be retried.`
          : "A batch review is already running.",
        code: "batch_review_running",
        startedAt: holder?.lockedAt ?? null,
      },
      { status: 409 },
    );
  }

  try {
    const result = await runBatchReview({ submissionIds, limit });
    return NextResponse.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // The lock is still released below: a batch that died is not a batch still running.
    console.error("[api/admin/review/batch] run failed", error);
    return NextResponse.json(
      { error: "The batch could not be completed. Nothing was paid; check the server log." },
      { status: 500 },
    );
  } finally {
    await releaseBatchRunLock(lock.token).catch((error) => {
      console.error("[api/admin/review/batch] could not release the run lock", error);
    });
  }
}
