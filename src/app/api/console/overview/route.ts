import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 86_400_000;
const FEE_PCT = 5; // platform fee on every settled payout → $BAG buy & burn

function weekStart(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
  return d.getTime();
}

// GET /api/console/overview — headline metrics + 12-week trend for Explore.
export async function GET() {
  const [campaigns, payouts, submissions, users, earningCreators] =
    await Promise.all([
      db.campaign.findMany(),
      db.payout.findMany(),
      db.submission.findMany(),
      db.user.count(),
      // Distinct creators who have actually been paid — the figure behind the
      // "wallets with at least one payout" label.
      db.payout.findMany({ distinct: ["userId"], select: { userId: true } }),
    ]);

  const now = Date.now();
  const totalPaid = payouts.reduce((s, p) => s + p.amount, 0);
  const since30 = payouts.filter((p) => p.createdAt.getTime() > now - 30 * 86_400_000);
  const prev30 = payouts.filter(
    (p) =>
      p.createdAt.getTime() <= now - 30 * 86_400_000 &&
      p.createdAt.getTime() > now - 60 * 86_400_000,
  );
  const paid30 = since30.reduce((s, p) => s + p.amount, 0);
  const paidPrev30 = prev30.reduce((s, p) => s + p.amount, 0);

  const live = campaigns.filter((c) => c.status === "LIVE" || c.status === "FILLING");

  // Spend per campaign comes from settled payouts. Deriving it from `fundedAmount`
  // (which equals the whole budget from the moment a bag is created) reported
  // "0% of budget committed left" on every bag, so the console always said $0 open.
  const paidByCampaign = new Map<string, number>();
  for (const submission of submissions) {
    if (submission.status !== "paid") continue;
    const already = paidByCampaign.get(submission.campaignId) ?? 0;
    paidByCampaign.set(
      submission.campaignId,
      already + (submission.payoutAmount ?? 0),
    );
  }

  const openBudget = live.reduce(
    (s, c) => s + Math.max(0, c.budget - (paidByCampaign.get(c.id) ?? 0)),
    0,
  );
  const spentPct = live.reduce((s, c) => {
    const spent = paidByCampaign.get(c.id) ?? 0;
    return s + Math.max(0, Math.min(1, spent / (c.budget || 1)));
  }, 0);
  const awaitingPayout = submissions
    .filter((s) => s.status === "approved")
    .reduce((s, x) => s + (x.payoutAmount ?? 0), 0);

  // 12-week trend buckets (oldest → newest) for the KPI sparklines
  const thisWeek = weekStart(now);
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const start = thisWeek - (11 - i) * WEEK_MS;
    const end = start + WEEK_MS;
    const inWeek = (d: Date) => d.getTime() >= start && d.getTime() < end;
    return {
      label: new Date(start).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      earned: Math.round(
        payouts.filter((p) => inWeek(p.createdAt)).reduce((s, p) => s + p.amount, 0) * 100,
      ) / 100,
      submissions: submissions.filter((s) => inWeek(s.createdAt)).length,
    };
  });

  return NextResponse.json({
    metrics: {
      totalPaid: Math.round(totalPaid * 100) / 100,
      paid30: Math.round(paid30 * 100) / 100,
      paidPrev30: Math.round(paidPrev30 * 100) / 100,
      liveBags: live.length,
      endingSoon: live.filter((c) => c.endsAt.getTime() - now < 7 * 86_400_000).length,
      creators: users,
      /** Creators with at least one settled payout (not "signed up"). */
      earningCreators: earningCreators.length,
      avgReward: payouts.length ? Math.round((totalPaid / payouts.length) * 100) / 100 : 0,
      openBudget: Math.round(openBudget * 100) / 100,
      slotsClaimedPct: live.length ? Math.round((spentPct / live.length) * 100) : 0,
      awaitingPayout: Math.round(awaitingPayout * 100) / 100,
      feeBurned: Math.round(totalPaid * (FEE_PCT / 100) * 100) / 100,
      settledCount: payouts.length,
    },
    weekly,
  });
}
