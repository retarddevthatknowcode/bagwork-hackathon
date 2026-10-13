import { NextRequest, NextResponse } from "next/server";

import { isTreasuryConfiguredFor, treasuryAddressFor, type TreasuryKind } from "@/lib/solana/treasury";

export const dynamic = "force-dynamic";

/**
 * GET /api/treasury — one of the two Bagwork treasury addresses, by `?kind=fixed|fee`.
 *
 * The create flows need the address *before* the publisher commits to anything, so it cannot wait
 * for a create response: a fixed-budget bag shows where the funding transfer goes, a flywheel shows
 * where the token's fee recipient must point. Public, because these are deposit addresses that are
 * shown to every publisher anyway; only the address is exposed, never the key or a balance.
 *
 * Defaults to `fixed` so pre-existing callers keep resolving the budget wallet.
 */
export async function GET(req: NextRequest) {
  const requested = (req.nextUrl.searchParams.get("kind") ?? "fixed").trim().toLowerCase();
  const kind: TreasuryKind = requested === "fee" ? "FEE" : "FIXED";
  const address = treasuryAddressFor(kind);

  if (!address) {
    return NextResponse.json(
      {
        address: null,
        kind,
        configured: false,
        error:
          kind === "FEE"
            ? "Fee redirect is paused: the fee treasury is not configured yet, so there is no address to route fees to."
            : "Funding is paused: the fixed-budget treasury is not configured yet, so there is nowhere to send a budget.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { address, kind, configured: isTreasuryConfiguredFor(kind) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
