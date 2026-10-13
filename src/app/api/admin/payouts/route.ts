import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";

export const dynamic = "force-dynamic";

/** GET /api/admin/payouts — every settled payout, newest first. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.payout.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      submission: {
        select: {
          id: true,
          platform: true,
          postUrl: true,
          views: true,
          feeAmount: true,
          campaign: {
            select: {
              id: true,
              title: true,
              project: { select: { tokenSymbol: true, name: true } },
            },
          },
        },
      },
      user: { select: { id: true, handle: true, walletAddress: true } },
    },
  });

  return NextResponse.json(
    {
      payouts: rows.map((p) => ({
        id: p.id,
        amount: p.amount,
        token: p.token,
        status: p.status,
        txSignature: p.txSignature,
        feeAmount: p.submission.feeAmount ?? 0,
        createdAt: p.createdAt.toISOString(),
        explorerUrl: `https://solscan.io/tx/${p.txSignature}`,
        submissionId: p.submission.id,
        platform: p.submission.platform,
        postUrl: p.submission.postUrl,
        views: p.submission.views,
        campaignId: p.submission.campaign.id,
        campaignTitle: p.submission.campaign.title,
        tokenSymbol: p.submission.campaign.project.tokenSymbol,
        projectName: p.submission.campaign.project.name,
        creatorHandle: p.user?.handle ?? null,
        creatorWallet: p.user?.walletAddress ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
