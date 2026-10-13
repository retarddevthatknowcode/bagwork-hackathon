import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { isAdmin } from "@/app/api/admin/login/route";
import { syncFees } from "@/lib/fees/sync";
import { logApiFailure } from "@/lib/ops/log";

export const dynamic = "force-dynamic";
/** Swapping waits on confirmation, so this needs room beyond the default. */
export const maxDuration = 60;

/**
 * Runs one pass, gated on either the cron secret or a signed-in user.
 *
 * Fail-closed when no secret is configured: an endpoint that signs swaps must never be reachable
 * anonymously, and "no secret set" is exactly when it would be.
 */
async function runSync(req: NextRequest) {
  /*
   * Two accepted secrets. Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`,
   * which is the platform's own convention, so that name has to work as well as our own — a
   * mismatch between the two would look like a working cron that silently 401s every run.
   */
  const secrets = [process.env.FEE_SYNC_SECRET, process.env.CRON_SECRET]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  const provided =
    (req.headers.get("x-fee-sync-secret") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "").trim();

  if (!(secrets.length > 0 && secrets.includes(provided))) {
    const [admin, session] = await Promise.all([Promise.resolve(isAdmin(req)), getSessionUser()]);
    if (!admin && !session) {
      return NextResponse.json(
        {
          error: secrets.length
            ? "Provide the fee sync secret in x-fee-sync-secret"
            : "Fee sync is closed: set FEE_SYNC_SECRET (or CRON_SECRET) to allow scheduled runs, or sign in as an admin",
        },
        { status: 401 },
      );
    }
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);

  try {
    const report = await syncFees(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fee sync failed";
    void logApiFailure(req, {
      category: "api",
      title: "Fee sync failed",
      error,
      status: 502,
    });
    console.error("[api/fees/sync] failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

/**
 * POST /api/fees/sync — one pass of the Fee Redirect loop.
 *
 * Detect incoming trading fees → record them → swap to USDC → grow the bag's budget.
 *
 * Scheduled by Vercel Cron (`vercel.json`). Note the schedule there is **daily**: the Hobby plan
 * rejects anything more frequent at deploy time. On Pro, changing that one string to run every ten
 * minutes is the whole upgrade — nothing in this route changes. Admin-initiated POSTs work anytime.
 *
 * Repeated runs are no-ops: the unique `signature` index and the per-deposit status guard mean a
 * deposit can only ever be credited once, so the schedule can be frequent without any risk of
 * double-crediting.
 */
export const POST = runSync;

/** Vercel Cron issues GET, so the same pass is reachable both ways. */
export const GET = runSync;
