import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { FeeSyncState } from "@/lib/types";

/**
 * Platform settings, read and written by the admin console.
 *
 * Why a table instead of an env var: the one setting here — whether the batch review engine may
 * run — is a *switch an operator flips while looking at the review board*. An env var would make
 * that a redeploy, and the value would then be whatever the last deploy said, so a toggle that is
 * meant to be pressed would silently revert itself. In the database it is state, and it survives.
 *
 * Reads are fail-closed on purpose: a missing row, an unreadable value or anything that is not
 * literally `true` all mean **off**. Every other failure in this module is allowed to be loud, but
 * this one must never be optimistic — the flag's whole job is to stop review from running.
 */

/** The one key this feature uses. A row per setting, so the next one needs no migration. */
export const BATCH_REVIEW_KEY = "batch_review";

/** What `batch_review`'s `value` holds. Small and explicit, so an unknown shape reads as off. */
interface BatchReviewValue {
  enabled?: unknown;
}

/**
 * The batch review switch.
 *
 * Absent row → false. That is the intended default: an operator opts in, nobody is opted in for
 * them, and a fresh deployment cannot start reviewing on its own.
 */
export async function getBatchReviewEnabled(): Promise<boolean> {
  const row = await db.platformSetting.findUnique({
    where: { key: BATCH_REVIEW_KEY },
    select: { value: true },
  });
  const value = (row?.value ?? null) as BatchReviewValue | null;
  return value?.enabled === true;
}

/** Flips the switch and returns what was stored, so the caller never reports its own guess. */
export async function setBatchReviewEnabled(enabled: boolean): Promise<boolean> {
  const row = await db.platformSetting.upsert({
    where: { key: BATCH_REVIEW_KEY },
    // Written as a whole object rather than merged, so an old shape cannot linger inside it.
    create: { key: BATCH_REVIEW_KEY, value: { enabled } },
    update: { value: { enabled } },
    select: { value: true },
  });
  const value = row.value as BatchReviewValue;
  return value.enabled === true;
}

/**
 * How long a lock can be held before another run may take it.
 *
 * A batch is bounded work, but a run that crashed mid-flight — a killed invocation, a deploy —
 * would otherwise wedge the button forever with no way for the operator to recover except SQL.
 * Ten minutes is comfortably longer than a full batch of fifty, and short enough that "try again
 * in ten minutes" is an acceptable answer.
 */
const LOCK_TTL_MS = 10 * 60 * 1000;

export interface BatchRunLock {
  token: string;
  acquiredAt: Date;
}

/**
 * Claims the batch lock, or returns null when someone else is running.
 *
 * The claim is one conditional `UPDATE ... WHERE locked_at IS NULL OR locked_at < stale` — the
 * only shape that is atomic against a second invocation. Read-then-write would let two clicks
 * (or a double-click) both see an idle row and both start reviewing the same queue.
 *
 * The row is created first if it does not exist, because an `updateMany` matching nothing is
 * indistinguishable from a lock that is held.
 */
export async function claimBatchRunLock(): Promise<BatchRunLock | null> {
  const token = randomBytes(12).toString("hex");
  const claimedAt = new Date();
  const staleBefore = new Date(claimedAt.getTime() - LOCK_TTL_MS);

  await db.platformSetting.upsert({
    where: { key: BATCH_REVIEW_KEY },
    create: { key: BATCH_REVIEW_KEY, value: {} },
    update: {},
    select: { key: true },
  });

  const claimed = await db.platformSetting.updateMany({
    where: {
      key: BATCH_REVIEW_KEY,
      OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
    },
    data: { lockedAt: claimedAt, lockedBy: token },
  });

  if (claimed.count !== 1) return null;
  return { token, acquiredAt: claimedAt };
}

/**
 * Why a run could not start, for the message the operator sees.
 *
 * Reported rather than swallowed: "another run is in progress" and "the last run died ten minutes
 * ago" are different situations, and an operator staring at a disabled button deserves to know
 * which one they are in.
 */
export async function describeBatchRunHolder(): Promise<{ lockedAt: string; stale: boolean } | null> {
  const row = await db.platformSetting.findUnique({
    where: { key: BATCH_REVIEW_KEY },
    select: { lockedAt: true },
  });
  if (!row?.lockedAt) return null;
  const stale = row.lockedAt.getTime() < Date.now() - LOCK_TTL_MS;
  return { lockedAt: row.lockedAt.toISOString(), stale };
}

/**
 * Releases a lock this run owns.
 *
 * Scoped by token, so a run that overran its TTL and lost the lock to a newer run cannot clear
 * that newer run's claim on its way out.
 */
export async function releaseBatchRunLock(token: string): Promise<void> {
  await db.platformSetting.updateMany({
    where: { key: BATCH_REVIEW_KEY, lockedBy: token },
    data: { lockedAt: null, lockedBy: null },
  });
}

/** Exposed so the API can report the TTL rather than hard-coding it in two places. */
export const BATCH_RUN_LOCK_TTL_MS = LOCK_TTL_MS;

/**
 * The fee sync's own bookkeeping row.
 *
 * Separate key from the review switch, same table: this one is written by the cron (and by a manual
 * `/api/fees/sync`) and read by the bag page, so a flywheel can say when its fees were last looked
 * for. Without it the only clock on the page is the newest deposit, which reads as "nothing has
 * happened here" during a quiet week even though the sweep ran every night.
 */
export const FEE_SYNC_KEY = "fee_sync";

// Imported for this module's own use and re-exported for callers that already reach for it here.
export type { FeeSyncState };

/** Best-effort: a bookshelf entry must never fail a sync that otherwise worked. */
export async function recordFeeSyncRun(state: Omit<FeeSyncState, "lastRunAt">): Promise<void> {
  /*
   * Written field by field rather than spread: Prisma's JSON input type wants an object with an index
   * signature, and an interface (deliberately) does not have one. Listing the fields also means a new
   * field in `FeeSyncState` has to be added here, where the shape is written down.
   */
  const value: Prisma.InputJsonObject = {
    lastRunAt: new Date().toISOString(),
    scanned: state.scanned,
    swapped: state.swapped,
    creditedUsdc: state.creditedUsdc,
    belowMinimum: state.belowMinimum,
    floorUsd: state.floorUsd,
    errors: state.errors,
  };

  await db.platformSetting.upsert({
    where: { key: FEE_SYNC_KEY },
    create: { key: FEE_SYNC_KEY, value },
    update: { value },
    select: { key: true },
  });
}

/** The last completed pass, or null when none has ever run on this deployment. */
export async function getFeeSyncState(): Promise<FeeSyncState | null> {
  const row = await db.platformSetting.findUnique({
    where: { key: FEE_SYNC_KEY },
    select: { value: true },
  });
  const value = (row?.value ?? null) as FeeSyncState | null;
  return value?.lastRunAt ? value : null;
}
