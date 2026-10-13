import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../login/route";
import { BATCH_REVIEW_DEFAULT_LIMIT, BATCH_REVIEW_MAX_LIMIT } from "@/lib/review/batch";
import {
  BATCH_RUN_LOCK_TTL_MS,
  describeBatchRunHolder,
  getBatchReviewEnabled,
  setBatchReviewEnabled,
} from "@/lib/settings/platform";

export const dynamic = "force-dynamic";

/**
 * Platform settings, admin-gated by the `bagwork_admin` cookie (see `api/admin/login`).
 *
 * Only one setting exists so far — whether the batch review engine may run — and the review desk is
 * the only consumer. It is a route rather than a server action so the flag is readable and writable
 * from the console's plain `fetch` helpers, and so the same endpoint can report the *state* the
 * button depends on: whether a run is in progress, and the size cap a run will use. The board needs
 * those three things together, and three endpoints would mean three ways to be briefly inconsistent.
 */
async function settingsPayload() {
  const [batchReviewEnabled, holder] = await Promise.all([
    getBatchReviewEnabled(),
    describeBatchRunHolder(),
  ]);

  return {
    batchReviewEnabled,
    /** True while a lock is held and not stale — the UI disables Run review on this. */
    running: holder !== null && !holder.stale,
    /** When the current run claimed the lock, so the console can say how long it has been going. */
    batchRunStartedAt: holder?.lockedAt ?? null,
    /** A lock older than this is treated as abandoned and may be taken by the next run. */
    lockTtlMs: BATCH_RUN_LOCK_TTL_MS,
    /** The run size the button will use, so the UI never hard-codes the same number. */
    limit: { default: BATCH_REVIEW_DEFAULT_LIMIT, max: BATCH_REVIEW_MAX_LIMIT },
  };
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await settingsPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * PATCH /api/admin/settings — flip the batch review switch.
 *
 * A boolean is required rather than defaulted: this toggles whether money-adjacent work is allowed
 * to run in bulk, and a malformed body must not be able to read as "turn it on".
 */
export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.batchReviewEnabled !== "boolean") {
    return NextResponse.json(
      { error: "batchReviewEnabled (boolean) is required" },
      { status: 400 },
    );
  }

  await setBatchReviewEnabled(body.batchReviewEnabled);
  // Returns the stored state rather than echoing the request, so the switch in the UI cannot
  // disagree with the row the batch route actually reads.
  return NextResponse.json(await settingsPayload(), {
    headers: { "Cache-Control": "no-store" },
  });
}
