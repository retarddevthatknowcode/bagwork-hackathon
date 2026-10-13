import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { MAX_DEV_BUY_BPS, launchAvailability } from "@/lib/launch/config";
import { estimateLaunchCosts } from "@/lib/launch/instructions";
import { getServerConnection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * POST /api/launches/quote — what a launch would cost, and how big the dev buy would be.
 *
 * A separate route from the build because the two answer different questions at different moments:
 * this one runs while the launcher is dragging the dev-buy slider, and it has to be cheap enough to
 * call on every change. It moves nothing and creates nothing — it is a read of the chain's current
 * curve parameters, and the numbers it returns are the ones the launcher will actually be asked to
 * sign for a moment later.
 *
 * The 10% cap is reported here as `withinCap` so the UI can stop the launcher before they try, but
 * this route is *not* where the cap is enforced — the build route refuses an over-large dev buy on
 * the real quote, and that is the check that matters.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required to launch a coin" }, { status: 401 });
  }

  const availability = launchAvailability();
  if (!availability.enabled) {
    return NextResponse.json({ error: availability.reason }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { devBuySol?: unknown };
  const devBuySol = Number(body.devBuySol ?? 0);
  if (!Number.isFinite(devBuySol) || devBuySol < 0) {
    return NextResponse.json({ error: "Dev buy must be zero or greater" }, { status: 400 });
  }

  try {
    const costs = await estimateLaunchCosts({
      connection: getServerConnection(),
      solLamports: Math.round(devBuySol * LAMPORTS_PER_SOL),
    });
    return NextResponse.json({ costs, maxDevBuyBps: MAX_DEV_BUY_BPS });
  } catch (error) {
    // Surfaced rather than flattened: a quote that cannot be produced usually means the RPC is
    // unreachable, and "the numbers could not be fetched" is a more useful thing to show than a
    // silent zero that would read as "this launch is free".
    console.error("[api/launches/quote] failed", error);
    return NextResponse.json(
      {
        error: `Could not price this launch — ${
          error instanceof Error && error.message ? error.message : "unknown RPC error"
        }`,
      },
      { status: 502 },
    );
  }
}
