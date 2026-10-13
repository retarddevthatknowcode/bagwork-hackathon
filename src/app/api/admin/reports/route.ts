import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { logApiFailure } from "@/lib/ops/log";
import { isOpsCategory, isOpsSource, isOpsStatus } from "@/lib/ops/types";
import { OPS_AUTHOR_SELECT, toOpsReportView, type OpsReportView } from "@/lib/ops/view";
import { isAdmin } from "../login/route";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const PER_PAGE_DEFAULT = 50;
const PER_PAGE_MAX = 200;

/**
 * GET /api/admin/reports — the ops feed, newest first, admin-gated.
 *
 * Fails closed on the admin cookie (see `api/admin/login`); nothing about this list is reachable
 * without it. Filters are validated against the shared vocabulary, so an unknown value is ignored
 * rather than passed into a `where` clause.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const source = params.get("source");
  const category = params.get("category");
  const from = params.get("from");
  const to = params.get("to");
  const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const perPage = Math.min(
    PER_PAGE_MAX,
    Math.max(1, Math.floor(Number(params.get("perPage")) || PER_PAGE_DEFAULT)),
  );

  const where: Prisma.OpsReportWhereInput = {};
  if (status && status !== "ALL" && isOpsStatus(status)) where.status = status;
  if (source && source !== "ALL" && isOpsSource(source)) where.source = source;
  if (category && category !== "ALL" && isOpsCategory(category)) where.category = category;

  // Whole days, in UTC — `from`/`to` are date inputs, not timestamps.
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) {
    const d = new Date(`${from}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (to) {
    const d = new Date(`${to}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }
  if (Object.keys(createdAt).length) where.createdAt = createdAt;

  try {
    const [rows, total, byStatus] = await Promise.all([
      db.opsReport.findMany({
        where,
        // Secondary key on `id`: `createdAt` is not unique and Postgres will not promise a stable
        // order for ties, so two reads of the same page could otherwise differ.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        include: OPS_AUTHOR_SELECT,
      }),
      db.opsReport.count({ where }),
      db.opsReport.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const countFor = (value: string) =>
      byStatus.find((row) => row.status === value)?._count._all ?? 0;

    const reports: OpsReportView[] = rows.map(toOpsReportView);

    return NextResponse.json(
      {
        reports,
        total,
        page,
        perPage,
        counts: {
          open: countFor("open"),
          acknowledged: countFor("acknowledged"),
          resolved: countFor("resolved"),
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    void logApiFailure(req, {
      category: "api",
      title: "Admin ops feed failed to load",
      error,
      status: 500,
    });
    console.error("[api/admin/reports] list failed", error);
    return NextResponse.json({ error: "Could not load reports" }, { status: 500, headers: NO_STORE });
  }
}
