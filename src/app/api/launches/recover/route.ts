import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { activateLaunchedBag } from "@/lib/launch/bag";
import { verifyLaunch } from "@/lib/launch/verify";
import { mapCampaign } from "@/lib/mappers";
import { logApiFailure } from "@/lib/ops/log";
import { getServerConnection, isValidSolanaAddress } from "@/lib/solana/connection";
import { isAdmin } from "@/app/api/admin/login/route";

export const dynamic = "force-dynamic";
/** Reading a sharing config is a chain call, and a retry loop is expected here. */
export const maxDuration = 60;

/**
 * POST /api/launches/recover — finish a launch whose coin already exists on-chain.
 *
 * This is the repair path for the failure that motivated it: the launcher signed everything, the
 * coin and its 100% fee lock went through, and then *Bagwork* failed to record it. The coin is real
 * and its fees are correctly locked, but the bag stayed DRAFT and nothing would ever pick it up —
 * the wizard's normal route needs signatures it no longer has, and re-running the launch would try
 * to mint a second coin.
 *
 * So this takes an existing launch and does only the missing half: read the fee lock off the chain,
 * and if it holds, open the bag that was reserved for it. It never creates a mint, never signs
 * anything, and is safe to run repeatedly — a launch that is already `verified` returns the same
 * success rather than doing the work twice.
 *
 * Available to the launcher and to an admin, because the account that hit this may not be able to
 * get back into the form that failed.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    const admin = isAdmin(req);
    if (!session && !admin) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const launchId = String(body?.launchId ?? "").trim();
    const mint = String(body?.mint ?? "").trim();
    if (!launchId && !mint) {
      return NextResponse.json(
        { error: "A launchId or a mint is required to recover a launch." },
        { status: 400 },
      );
    }
    if (mint && !isValidSolanaAddress(mint)) {
      return NextResponse.json(
        { error: "That mint is not a valid Solana address." },
        { status: 400 },
      );
    }

    const launch = await db.launch.findFirst({
      where: launchId ? { id: launchId } : { mint },
      select: {
        id: true,
        mint: true,
        status: true,
        bagId: true,
        treasury: true,
        feeShareBps: true,
        adminRevoked: true,
        launcherUserId: true,
      },
    });
    if (!launch) {
      return NextResponse.json({ error: "No launch found for that id or mint." }, { status: 404 });
    }
    // The launcher, or an admin. Anyone else has no business opening someone else's bag.
    if (!admin && launch.launcherUserId && launch.launcherUserId !== session?.user.id) {
      return NextResponse.json(
        { error: "This launch belongs to another account." },
        { status: 403 },
      );
    }

    if (launch.status === "verified" && launch.bagId) {
      const existing = await db.campaign.findUniqueOrThrow({
        where: { id: launch.bagId },
        include: { project: true },
      });
      return NextResponse.json({
        launchId: launch.id,
        mint: launch.mint,
        campaignId: existing.id,
        redirectUrl: `/dashboard/bags/${existing.id}`,
        campaign: mapCampaign(existing, { submissionsCount: 0, spent: 0 }),
        feeLock: {
          treasury: launch.treasury,
          shareBps: launch.feeShareBps,
          adminRevoked: launch.adminRevoked,
        },
        alreadyVerified: true,
      });
    }

    /*
     * A launch with no reserved bag predates bag reservation, and its draft — the bag's rules, its
     * rate, its duration — was never stored on the launch row, so there is nothing here to build the
     * bag from. Say so rather than inventing one: re-running the launch form is the honest
     * instruction, and the coin is unaffected either way.
     */
    if (!launch.bagId) {
      return NextResponse.json(
        {
          error:
            "This launch was made before bags were reserved up front, so its bag cannot be rebuilt " +
            "from the launch record alone. The coin itself is fine — finish the launch from the " +
            "launch form, or contact support with the mint.",
          coinCreated: true,
        },
        { status: 422 },
      );
    }

    if (!isValidSolanaAddress(launch.treasury)) {
      return NextResponse.json(
        { error: "This launch has no treasury recorded, so its fee lock cannot be checked." },
        { status: 503 },
      );
    }

    // Compared against the treasury this launch pinned, not the deployment's current one — see the
    // note in `/api/launches`. The record is what the chain has to be checked against.
    const verification = await verifyLaunch({
      connection: getServerConnection(),
      mint: launch.mint,
      treasury: launch.treasury,
    });

    if (!verification.ok) {
      // An unreachable chain is retryable. A genuinely unlocked coin is not, and says why.
      return NextResponse.json(
        { error: verification.error, retryable: verification.transient === true },
        { status: verification.transient ? 503 : 422 },
      );
    }

    const campaign = await activateLaunchedBag({
      campaignId: launch.bagId,
      launcherUserId: launch.launcherUserId ?? session?.user.id ?? "",
      feeRedirectPct: verification.feeShareBps / 100,
    });

    await db.launch.update({
      where: { id: launch.id },
      data: {
        status: "verified",
        error: null,
        bagId: campaign.id,
        feeShareBps: verification.feeShareBps,
        adminRevoked: verification.adminRevoked,
        verifiedAt: new Date(),
      },
    });

    return NextResponse.json({
      launchId: launch.id,
      mint: launch.mint,
      campaignId: campaign.id,
      redirectUrl: `/dashboard/bags/${campaign.id}`,
      campaign: mapCampaign(campaign, { submissionsCount: 0, spent: 0 }),
      feeLock: {
        treasury: launch.treasury,
        shareBps: verification.feeShareBps,
        adminRevoked: verification.adminRevoked,
      },
    });
  } catch (error) {
    await logApiFailure(req, { category: "launch", title: "Launch recovery failed", error });
    console.error("[api/launches/recover] failed", error);
    return NextResponse.json(
      { error: "Could not complete this launch. Nothing was changed — try again.", retryable: true },
      { status: 500 },
    );
  }
}
