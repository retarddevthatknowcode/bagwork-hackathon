import { NextRequest, NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { isValidTxSignature, withRpcFallback } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * POST /api/launches/step — did one launch step actually succeed on-chain?
 *
 * A wallet handing back a signature means the transaction was *sent*. Waiting for
 * `commitment: "confirmed"` means it was *seen*. Neither means it *worked*: a reverted transaction --
 * most often a dev buy without enough SOL behind it, or a create that lost a race -- is confirmed
 * and failed at the same time. The wizard treated confirmation as success, which is how a launch
 * with no dev buy behind it could be reported as complete.
 *
 * So each step's signature comes back here, where the chain is asked the only question that matters.
 * Only the launcher's own sign-in can ask: it is a read, but it is a read *for* someone, and there is
 * no reason to serve it to anyone else.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const signature = String(body?.signature ?? "").trim();
  if (!isValidTxSignature(signature)) {
    return NextResponse.json({ error: "A transaction signature is required." }, { status: 400 });
  }

  try {
    const transaction = await withRpcFallback((conn) =>
      conn.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
    );

    // Not visible yet is the normal state for a few seconds after a broadcast -- not a failure.
    if (!transaction) {
      return NextResponse.json({ status: "pending" });
    }
    if (transaction.meta?.err) {
      return NextResponse.json({
        status: "failed",
        error: "The transaction was rejected by the chain.",
      });
    }
    return NextResponse.json({ status: "confirmed" });
  } catch (error) {
    // The chain could not be read, which is not evidence either way. Say "pending" so the caller
    // looks again rather than abandoning a step that may have succeeded.
    console.warn("[api/launches/step] could not read the transaction", error);
    return NextResponse.json({ status: "pending" });
  }
}
