import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "../login/route";
import { logApiFailure } from "@/lib/ops/log";
import {
  ReviewConflict,
  ReviewNotFound,
  reviewSubmission,
} from "@/lib/review-engine";

export const dynamic = "force-dynamic";

// An approval now pays out on the spot: build + sign + send + confirm on-chain, which needs
// room beyond the default timeout.
export const maxDuration = 60;

/**
 * POST /api/admin/review — run the anti-slop engine on any submission.
 *
 * The operator's "score this for me" action: it calls the *same* `reviewSubmission` the
 * creator path uses, so a submission scored from the console and one scored by its author
 * get identical treatment. Admin auth is the cookie, so this works for a reviewer who has
 * no Privy session.
 *
 * Scoring writes a verdict (`approved` / `rejected`) and computes the payout. An operator
 * who disagrees can still override with `POST /api/admin/approve` (adjust the amount) or
 * `POST /api/admin/reject` (with a reason).
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const submissionId = body?.submissionId;
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  try {
    const outcome = await reviewSubmission(submissionId);
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof ReviewNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ReviewConflict) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    void logApiFailure(req, {
      category: "review",
      title: "Submission review failed",
      error,
      status: 500,
      meta: { submissionId },
    });
    console.error("[api/admin/review] review failed", error);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
