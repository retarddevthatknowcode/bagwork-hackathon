import { NextRequest, NextResponse } from "next/server";

import { isValidSolanaAddress } from "@/lib/solana/connection";
import { resolveToken } from "@/lib/solana/token-metadata";

export const dynamic = "force-dynamic";

/**
 * GET /api/tokens/[mint] — resolve a contract address into something a publisher can check.
 *
 * This exists so a custom token can be confirmed by *what the chain says*, not by what the
 * form guessed: name, symbol, decimals and logo all come back from the mint account. Decimals
 * in particular are load-bearing — a token stored with the wrong ones would make every payout
 * off by orders of magnitude — so the client shows these values and posts them back, rather
 * than assuming 9 decimals the way wrapped SOL happens to be.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mint: string }> },
) {
  const { mint } = await params;

  if (!isValidSolanaAddress(mint)) {
    return NextResponse.json(
      { error: "That is not a valid Solana token address" },
      { status: 400 },
    );
  }

  const token = await resolveToken(mint);
  if (!token || !token.symbol) {
    // Either nothing lives at that address, or it is a mint we cannot name. Both mean the
    // same thing to the publisher: this is not a token we can budget a bag in.
    return NextResponse.json(
      {
        error:
          "No token found at that address on Solana. Check you pasted the contract address and not a wallet.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ token });
}
