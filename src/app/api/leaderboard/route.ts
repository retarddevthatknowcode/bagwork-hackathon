import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapLeaderboard } from "@/lib/mappers";
import { recomputeLeaderboard } from "@/lib/leaderboard";
import { isAdmin } from "../admin/login/route";

export async function GET() {
  const rows = await db.leaderboard.findMany({
    orderBy: { rank: "asc" },
    take: 100,
  });
  // The marketing board, identical for every visitor. One short shared cache keeps it off the
  // database for everyone behind the first request; the ranking only moves when a payout
  // settles, so a minute of staleness is invisible.
  return NextResponse.json(
    { leaderboard: rows.map(mapLeaderboard) },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
  );
}

/**
 * POST /api/leaderboard — admin-only rebuild of the ranking table.
 *
 * Payouts rebuild it automatically; this exists so an operator can backfill it after a
 * data import or a correction without waiting for the next settlement.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ranked = await recomputeLeaderboard();
  return NextResponse.json({ ok: true, ranked });
}
