import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { solanaExplorerUrl } from "@/lib/privy/config";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET /api/console/payouts — the signed-in creator's settled payouts.
 *
 * This returned **every payout on the platform**, unauthenticated: any visitor to
 * `/dashboard/earnings` saw other people's earnings and wallet transaction history.
 * It is now scoped to the session user and 401s when there is no session.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const rows = await db.payout.findMany({
    where: { submission: { userId: session.user.id } },
    include: {
      submission: { include: { campaign: { include: { project: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const payouts = rows.map((p) => ({
    id: p.id,
    amount: p.amount,
    token: p.token,
    txSignature: p.txSignature,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    // Cluster-aware: Solscan needs `?cluster=devnet` off mainnet.
    explorerUrl: solanaExplorerUrl("tx", p.txSignature),
    campaignId: p.submission.campaignId,
    campaignTitle: p.submission.campaign.title,
    projectName: p.submission.campaign.project.name,
    tokenSymbol: p.submission.campaign.project.tokenSymbol,
    tokenColor: p.submission.campaign.project.tokenColor,
    platform: p.submission.platform,
    views: p.submission.views,
  }));

  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const total = payouts.reduce((s, p) => s + p.amount, 0);
  const summary = {
    total: Math.round(total * 100) / 100,
    count: payouts.length,
    avg: payouts.length ? Math.round((total / payouts.length) * 100) / 100 : 0,
    thisMonth:
      Math.round(
        payouts
          .filter((p) => new Date(p.createdAt).getTime() >= monthStart.getTime())
          .reduce((s, p) => s + p.amount, 0) * 100,
      ) / 100,
    last30:
      Math.round(
        payouts
          .filter((p) => new Date(p.createdAt).getTime() > now - 30 * 86_400_000)
          .reduce((s, p) => s + p.amount, 0) * 100,
      ) / 100,
    largest: payouts.length ? Math.max(...payouts.map((p) => p.amount)) : 0,
  };

  const monthly = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    d.setMonth(d.getMonth() - (5 - i));
    const next = new Date(d);
    next.setMonth(next.getMonth() + 1);
    const inMonth = payouts.filter((p) => {
      const t = new Date(p.createdAt).getTime();
      return t >= d.getTime() && t < next.getTime();
    });
    return {
      label: d.toLocaleDateString("en-US", { month: "short" }),
      value: Math.round(inMonth.reduce((s, p) => s + p.amount, 0) * 100) / 100,
      count: inMonth.length,
    };
  });

  return NextResponse.json({ payouts, summary, monthly }, { headers: NO_STORE });
}
