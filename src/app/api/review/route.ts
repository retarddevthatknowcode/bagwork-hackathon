import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { mapSubmission } from "@/lib/mappers";
import { ReviewConflict, ReviewNotFound, reviewSubmission } from "@/lib/review-engine";

export const dynamic = "force-dynamic";

// An approval now pays out on the spot: build + sign + send + confirm on-chain, which needs
// room beyond the default timeout.
export const maxDuration = 60;

/**
 * POST /api/review — score the signed-in creator's own submission.
 *
 * All scoring, verdict, payout and slot logic lives in `lib/review-engine.ts`, shared with
 * the admin console's "Run review" action so the two paths can never disagree. This route
 * only owns authorisation: a verified session, and ownership of the submission.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const submissionId = body?.submissionId;
  if (!submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  const owned = await db.submission.findUnique({
    where: { id: submissionId },
    select: { userId: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (owned.userId !== session.user.id) {
    return NextResponse.json({ error: "Not your submission" }, { status: 403 });
  }

  try {
    const outcome = await reviewSubmission(submissionId);
    const row = await db.submission.findUnique({
      where: { id: submissionId },
      include: { campaign: { include: { project: true } } },
    });
    return NextResponse.json({ submission: row ? mapSubmission(row) : null, ...outcome });
  } catch (error) {
    if (error instanceof ReviewNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ReviewConflict) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/review] review failed", error);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
