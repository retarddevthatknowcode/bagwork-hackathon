import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import {
  SOLANA_CLUSTER_NAME,
  getSolanaBalanceLamports,
  isValidSolanaAddress,
} from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * GET /api/wallet/balance?address=<solana address> — native SOL for one wallet.
 *
 * Exists so the console header can show a live balance without ever exposing an RPC key to the
 * browser: the read goes through the server's provider chain (Helius → Alchemy → public), the same
 * chain every other balance read uses. A balance is public on-chain data, so this route is public
 * like `/api/tokens/[mint]` — it only accepts an address and returns that address's SOL.
 *
 * The address is required rather than resolved from the session: the caller already holds the
 * connected wallet from Privy, and requiring it keeps this a plain read instead of a route that
 * triggers a database sync as a side effect. An invalid address is a `400`, not a zero — "this is
 * not a wallet" and "this wallet holds nothing" are different answers.
 *
 * A `null` balance means every provider failed, which the client renders as unknown (`—`) rather
 * than as `0 SOL`.
 */
export async function GET(req: NextRequest) {
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();

  if (!address) {
    return NextResponse.json(
      { error: "An address is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isValidSolanaAddress(address)) {
    return NextResponse.json(
      { error: "That is not a valid Solana address" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const lamports = await getSolanaBalanceLamports(address);
  const balanceSol =
    lamports === null ? null : Math.round((lamports / LAMPORTS_PER_SOL) * 1e9) / 1e9;

  return NextResponse.json(
    { address, cluster: SOLANA_CLUSTER_NAME, balanceSol },
    { headers: { "Cache-Control": "no-store" } },
  );
}
