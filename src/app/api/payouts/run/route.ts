import { NextRequest, NextResponse } from "next/server";

import { isAdmin } from "@/app/api/admin/login/route";
import { logApiFailure } from "@/lib/ops/log";
import { settleDuePayouts } from "@/lib/payouts/settle";

export const dynamic = "force-dynamic";
/** Each payout builds, signs, sends and confirms on-chain; the sweep needs the room. */
export const maxDuration = 60;

/**
 * POST /api/payouts/run — one pass over every approved payout that is due.
 *
 * The safety net behind the automatic payout: approval pays on the spot, and anything that
 * could not be paid then (a treasury that needed topping up, an in-flight transfer, a chain that
 * could not be read) is retried here. Safe to run often — a submission that already carries a
 * broadcast signature is *confirmed*, never re-sent, and a recorded payout is skipped entirely.
 *
 * Auth differs from the fee sync on purpose: money moves here, so a signed-in session is not
 * enough. Vercel Cron's `Authorization: Bearer $CRON_SECRET` (or `PAYOUT_RUN_SECRET`) opens the
 * door, and so does the admin cookie — nothing else.
 */
async function runSweep(req: NextRequest) {
  const secrets = [process.env.PAYOUT_RUN_SECRET, process.env.CRON_SECRET]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  const provided = (
    req.headers.get("x-payout-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  ).trim();

  if (!(secrets.length > 0 && secrets.includes(provided))) {
    if (!(await isAdmin(req))) {
      return NextResponse.json(
        {
          error: secrets.length
            ? "Provide the payout run secret in x-payout-secret, or sign in as an admin."
            : "The payout sweep is closed: set PAYOUT_RUN_SECRET (or CRON_SECRET) to allow scheduled runs.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 25);

  try {
    const report = await settleDuePayouts(Number.isFinite(limit) ? limit : 25);
    return NextResponse.json(
      { ok: true, report },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The payout sweep failed";
    void logApiFailure(req, {
      category: "payout",
      title: "Payout sweep failed",
      error,
      status: 502,
    });
    console.error("[api/payouts/run] failed", error);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export const POST = runSweep;

/** Vercel Cron issues GET, so the same sweep is reachable both ways. */
export const GET = runSweep;
