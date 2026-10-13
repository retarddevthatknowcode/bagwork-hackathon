import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";
import { syncWeeklyQuestsSafely } from "@/lib/quests/engine";

// POST /api/admin/reject — reject a submission
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  const sub = await db.submission.findUnique({
    where: { id: body.submissionId },
  });
  if (!sub) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const updated = await db.submission.update({
    where: { id: body.submissionId },
    data: {
      status: "rejected",
      /**
       * A rejected submission's views are no longer verified work, so the timestamp the
       * "View Hunter" quest sums over is cleared. Already-completed quests keep their points —
       * see `syncWeeklyQuests`, which never rewrites a completed week.
       */
      approvedAt: null,
      reviewNote: `Rejected by admin. ${body.reason ?? ""}`.trim(),
    },
  });

  // Give the slot back, but only on the transition INTO rejected.
  //
  // Without the guard, rejecting an already-rejected submission would mint a slot out of
  // nothing (the increment is not idempotent). `POST /api/submissions` consumed the slot,
  // so releasing it here keeps the bag's advertised capacity accurate.
  if (sub.status !== "rejected") {
    await db.campaign
      .update({
        where: { id: sub.campaignId },
        data: { slotsRemaining: { increment: 1 } },
      })
      .catch(() => {});
  }

  // A rejection can lower this week's verified-views total (and drop a link out of the
  // "Content Creator" count), so the board is recomputed rather than left stale.
  await syncWeeklyQuestsSafely(sub.userId, `admin rejection of submission ${sub.id}`);

  return NextResponse.json({
    ok: true,
    submissionId: updated.id,
    status: "rejected",
    slotReturned: sub.status !== "rejected",
  });
}
