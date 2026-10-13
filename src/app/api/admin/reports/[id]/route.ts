import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { logApiFailure } from "@/lib/ops/log";
import { clampMultiline, isOpsStatus } from "@/lib/ops/types";
import { OPS_AUTHOR_SELECT, toOpsReportView } from "@/lib/ops/view";
import { isAdmin } from "../../login/route";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** An operator note is a sentence or two, not a document. */
const NOTE_MAX = 1_000;

/**
 * PATCH /api/admin/reports/[id] — move a report's status, and optionally leave a note.
 *
 * Only `status` and `adminNote` are writable: the report's own text is the reporter's, and the
 * operator's job is to say what happened to it, not to rewrite it. `resolvedAt` is derived from
 * the new status — a re-opened report stops claiming a resolution time.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as
    | { status?: unknown; adminNote?: unknown }
    | null;

  if (!isOpsStatus(body?.status)) {
    return NextResponse.json(
      { error: "status must be open, acknowledged or resolved" },
      { status: 400, headers: NO_STORE },
    );
  }

  const status = body.status;
  const adminNote =
    typeof body?.adminNote === "string" && body.adminNote.trim()
      ? clampMultiline(body.adminNote, NOTE_MAX)
      : null;

  try {
    const updated = await db.opsReport.update({
      where: { id },
      data: {
        status,
        // Only overwrite the note when one was actually supplied, so a status tap alone cannot
        // wipe a note an operator wrote earlier.
        ...(adminNote !== null ? { adminNote } : {}),
        resolvedAt: status === "resolved" ? new Date() : null,
      },
      include: OPS_AUTHOR_SELECT,
    });

    return NextResponse.json({ report: toOpsReportView(updated) }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "No such report" }, { status: 404, headers: NO_STORE });
    }
    void logApiFailure(req, {
      category: "api",
      title: "Admin report update failed",
      error,
      status: 500,
      meta: { reportId: id },
    });
    console.error("[api/admin/reports/[id]] update failed", error);
    return NextResponse.json({ error: "Could not update the report" }, { status: 500, headers: NO_STORE });
  }
}
