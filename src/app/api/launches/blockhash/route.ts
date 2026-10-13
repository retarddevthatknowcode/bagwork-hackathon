import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { withRpcFallback } from "@/lib/solana/connection";
export const dynamic = "force-dynamic";

/**
 * GET /api/launches/blockhash — a fresh blockhash, for the step about to be signed.
 *
 * This exists because of what went wrong with real launches. The build route returns every step of a
 * launch in one response, and it gave them **one blockhash between them**. A Solana blockhash is good
 * for about 150 blocks — a minute or so — and a three-step launch means three wallet approvals, each
 * of them someone reading a Phantom popup, with a confirmation wait between them. The dev buy and the
 * fee lock were therefore often signed against a blockhash that had already expired, which fails as
 * "blockhash not found" and looks exactly like a broken launch: the buy silently reverted, the lock
 * stuck, and retrying the lock by hand worked because *that* path rebuilds its transaction with a
 * fresh one.
 *
 * So the chunk of the plan is still built once, but the blockhash is fetched here, one step ahead of
 * the signature that needs it. The client sets it on the transaction before signing, which is the
 * only moment it can be correct.
 */
export async function GET(_req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { blockhash } = await withRpcFallback(
      (connection) => connection.getLatestBlockhash("confirmed"),
      { label: "getLatestBlockhash" },
    );
    return NextResponse.json(
      { blockhash },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error("[api/launches/blockhash] failed", error);
    return NextResponse.json(
      { error: "Solana could not be reached for a fresh blockhash. Try again in a moment." },
      { status: 503 },
    );
  }
}
