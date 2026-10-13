import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";

export const dynamic = "force-dynamic";

const FEE_PCT = 5; // 5% platform fee on every settled payout → $BAG buy&burn + treasury

/**
 * GET /api/admin/overview — every headline number the operator needs, in one request.
 *
 * Read-only and admin-gated (cookie, not Privy — see `api/admin/login`). It reports the
 * real tables only: users, campaigns, submissions and payouts. Nothing here is derived
 * from `fundedAmount`, because that is the escrow commitment rather than money spent, so
 * "paid out" is always the sum of settled payouts.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [users, campaigns, submissions, payouts, leaderboard] = await Promise.all([
    db.user.findMany({
      select: {
        id: true,
        handle: true,
        trustScore: true,
        totalEarned: true,
        walletAddress: true,
        createdAt: true,
        /*
         * Real activity, so the creator/publisher split below is derived from what people have
         * actually done rather than from the retired `userType` column.
         */
        submissions: true,
        _count: { select: { campaigns: true } },
      },
    }),
    db.campaign.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        budget: true,
        fundedAmount: true,
        slotsRemaining: true,
        createdBy: true,
        createdAt: true,
        project: { select: { tokenSymbol: true, name: true } },
      },
    }),
    db.submission.findMany({
      select: {
        id: true,
        status: true,
        payoutAmount: true,
        feeAmount: true,
        views: true,
        qualityScore: true,
        authenticityScore: true,
        createdAt: true,
      },
    }),
    db.payout.findMany({ select: { amount: true, token: true, createdAt: true } }),
    db.leaderboard.count(),
  ]);

  const totalPaid = payouts.reduce((sum, p) => sum + p.amount, 0);
  const byStatus = (status: string) =>
    submissions.filter((s) => s.status === status).length;

  const awaitingReview = submissions.filter(
    (s) => s.status === "pending" || s.status === "reviewing",
  ).length;
  const awaitingPayout = submissions.filter((s) => s.status === "approved");
  const paidSubmissions = submissions.filter((s) => s.status === "paid");

  const live = campaigns.filter((c) => c.status === "LIVE" || c.status === "FILLING");

  // Money still available to creators = budget minus settled payouts. Deriving it from
  // `fundedAmount` would report $0 open on every bag, because a bag is funded for its full
  // budget the moment it is created.
  const paidByCampaign = new Map<string, number>();
  const paidRows = await db.submission.findMany({
    where: { status: "paid" },
    select: { campaignId: true, payoutAmount: true },
  });
  for (const row of paidRows) {
    paidByCampaign.set(
      row.campaignId,
      (paidByCampaign.get(row.campaignId) ?? 0) + (row.payoutAmount ?? 0),
    );
  }
  const openBudget = live.reduce(
    (sum, c) => sum + Math.max(0, c.budget - (paidByCampaign.get(c.id) ?? 0)),
    0,
  );

  const feesCollected =
    paidSubmissions.reduce((sum, s) => sum + (s.feeAmount ?? 0), 0) ||
    // Older rows predate `feeAmount`; fall back to the documented 5% so the figure is not
    // misleadingly zero.
    Math.round(totalPaid * (FEE_PCT / 100) * 100) / 100;

  const weekAgo = Date.now() - 7 * 86_400_000;

  return NextResponse.json({
    metrics: {
      users: users.length,
      usersWithWallet: users.filter((u) => Boolean(u.walletAddress)).length,
      /*
       * Derived from behaviour, not from the old `userType` column.
       *
       * "Creators" and "publishers" used to be whoever had picked a role, which told you what
       * someone said about themselves rather than what they did — and the roles no longer exist,
       * so those filters would now read zero for everyone.
       */
      creators: users.filter((u) => u.submissions > 0).length,
      publishers: users.filter((u) => u._count.campaigns > 0).length,
      newUsersThisWeek: users.filter((u) => u.createdAt.getTime() > weekAgo).length,

      campaigns: campaigns.length,
      liveCampaigns: live.length,
      endedCampaigns: campaigns.filter((c) => c.status === "ENDED").length,
      campaignsWithoutOwner: campaigns.filter((c) => !c.createdBy).length,
      totalBudget: Math.round(campaigns.reduce((s, c) => s + c.budget, 0) * 100) / 100,
      openBudget: Math.round(openBudget * 100) / 100,

      submissions: submissions.length,
      pending: byStatus("pending"),
      reviewing: byStatus("reviewing"),
      approved: byStatus("approved"),
      rejected: byStatus("rejected"),
      paid: byStatus("paid"),
      awaitingReview,
      awaitingPayoutCount: awaitingPayout.length,
      awaitingPayoutTotal:
        Math.round(awaitingPayout.reduce((s, x) => s + (x.payoutAmount ?? 0), 0) * 100) / 100,

      payouts: payouts.length,
      totalPaid: Math.round(totalPaid * 100) / 100,
      feesCollected: Math.round(feesCollected * 100) / 100,
      avgPayout: payouts.length
        ? Math.round((totalPaid / payouts.length) * 100) / 100
        : 0,
      largestPayout: payouts.length ? Math.max(...payouts.map((p) => p.amount)) : 0,
      paidLast7Days:
        Math.round(
          payouts
            .filter((p) => p.createdAt.getTime() > weekAgo)
            .reduce((s, p) => s + p.amount, 0) * 100,
        ) / 100,

      totalViews: submissions.reduce((s, x) => s + x.views, 0),
      rankedCreators: leaderboard,
    },
  });
}
