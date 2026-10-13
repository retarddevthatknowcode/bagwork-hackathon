import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { launchTreasury } from "@/lib/launch/config";
import { MAX_TRANSACTION_BYTES, buildFeeShareTransaction } from "@/lib/launch/instructions";
import { getServerConnection, isValidSolanaAddress } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * POST /api/launches/lock — rebuild the fee-lock step for a coin that already exists.
 *
 * The retry half of the two-step launch. When the create lands and the fee lock does not, the coin is
 * live with its creator fees unlocked, and the repair is to send the lock again — this is where those
 * bytes come from. Rebuilding the whole launch would be wrong instead of merely wasteful: `create_v2`
 * would be asked to mint a coin that is already on-chain, and the transaction would fail.
 *
 * Nothing here creates or mutates anything. It returns an unsigned transaction for the launcher to
 * sign, exactly as `build` does, and the resulting signature is still only believed once
 * `/api/launches` has read the sharing config back off the chain.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const launchId = String(body?.launchId ?? "").trim();
  if (!launchId) {
    return NextResponse.json({ error: "launchId is required" }, { status: 400 });
  }

  const launch = await db.launch.findUnique({
    where: { id: launchId },
    select: {
      id: true,
      mint: true,
      status: true,
      launcherUserId: true,
      launcherWallet: true,
    },
  });
  if (!launch) {
    return NextResponse.json({ error: "Launch not found" }, { status: 404 });
  }
  // Only the launcher may retry their own launch — the transaction is signed by, and paid for from,
  // their wallet.
  if (launch.launcherUserId && launch.launcherUserId !== session.user.id) {
    return NextResponse.json({ error: "This launch belongs to another account" }, { status: 403 });
  }
  if (launch.status === "verified") {
    return NextResponse.json(
      { error: "This launch is already complete — its fees are locked and its bag already exists." },
      { status: 409 },
    );
  }
  if (!isValidSolanaAddress(launch.launcherWallet)) {
    return NextResponse.json(
      { error: "This launch has no launcher wallet recorded, so the fee lock cannot be rebuilt." },
      { status: 409 },
    );
  }

  /*
   * The treasury this deployment receives fees at, not the one stored on the launch row.
   *
   * The verification that follows compares the chain against the deployment's own FEE treasury, so
   * building the lock for any other address would produce a transaction that is then refused. Better
   * to build the right one, or to say plainly that the deployment is misconfigured now.
   */
  const treasury = launchTreasury();
  if (!treasury) {
    return NextResponse.json(
      { error: "The fee treasury is not configured, so the fee lock cannot be built." },
      { status: 503 },
    );
  }

  try {
    const built = await buildFeeShareTransaction({
      connection: getServerConnection(),
      launcher: new PublicKey(launch.launcherWallet),
      mint: new PublicKey(launch.mint),
      treasury: new PublicKey(treasury),
    });

    return NextResponse.json({
      launchId: launch.id,
      mint: launch.mint,
      treasury,
      bytes: built.bytes,
      maxStepBytes: MAX_TRANSACTION_BYTES,
      transaction: Buffer.from(
        built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      ).toString("base64"),
    });
  } catch (error) {
    console.error("[api/launches/lock] failed", error);
    return NextResponse.json(
      {
        error: `Could not rebuild the fee lock — ${
          error instanceof Error && error.message ? error.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }
}
