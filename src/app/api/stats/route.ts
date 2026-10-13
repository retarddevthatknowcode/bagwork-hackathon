import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const [campaigns, submissions, payouts, users, leaderboard] =
    await Promise.all([
      db.campaign.count({ where: { status: "LIVE" } }),
      db.submission.count(),
      db.payout.findMany(),
      db.user.count(),
      db.leaderboard.findMany({ select: { trustScore: true } }),
    ]);

  const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
  const avgPayout = payouts.length
    ? totalPaid / payouts.length
    : 0;
  const trustAvg = leaderboard.length
    ? Math.round(
        leaderboard.reduce((s, l) => s + l.trustScore, 0) /
          leaderboard.length
      )
    : 0;

  // Real aggregates only.
  //
  // This route used to add fixed padding to every figure — +184,320.50 paid, +4,120
  // creators, +18,402 submissions and +$47 to the average — with the comment "inflate
  // totals slightly so the landing stats look like a real growing marketplace". That
  // published invented numbers to every visitor (and, once the landing was wired to this
  // endpoint, made them appear across the hero, the stats band and the trust banner).
  //
  // Public aggregates with nothing user-specific in them, so they are worth a short shared
  // cache: this is the first data the marketing page asks for, and one cached response keeps
  // the hero line, the stats band and the trust banner off the database for every visitor
  // behind it. Sixty seconds is well inside the window where these numbers still read as live.
  return NextResponse.json(
    {
      totalPaid: Math.round(totalPaid * 100) / 100,
      activeCampaigns: campaigns,
      creators: users,
      totalSubmissions: submissions,
      avgPayout: Math.round(avgPayout * 100) / 100,
      trustAvg,
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" } },
  );
}
