import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "../login/route";

export const dynamic = "force-dynamic";

/** GET /api/admin/users — every account, with what it has actually done. */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      privyId: true,
      handle: true,
      displayName: true,
      walletAddress: true,
      trustScore: true,
      totalEarned: true,
      submissions: true,
      approvals: true,
      onboardingCompletedAt: true,
      createdAt: true,
      lastSeenAt: true,
      // Real activity, counted rather than trusted from the denormalised counters.
      _count: { select: { submissionsRel: true, payouts: true, campaigns: true } },
    },
  });

  return NextResponse.json(
    {
      users: users.map((u) => ({
        id: u.id,
        privyId: u.privyId,
        handle: u.handle,
        displayName: u.displayName,
        walletAddress: u.walletAddress,
        trustScore: u.trustScore,
        totalEarned: u.totalEarned,
        onboardingCompleted: u.onboardingCompletedAt !== null,
        createdAt: u.createdAt.toISOString(),
        submissionsCount: u._count.submissionsRel,
        payoutsCount: u._count.payouts,
        bagsFunded: u._count.campaigns,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
