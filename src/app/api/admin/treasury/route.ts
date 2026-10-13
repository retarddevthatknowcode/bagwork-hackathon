import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { isAdmin } from "../login/route";
import {
  getRpcHealth,
  isAlchemyConfigured,
  isHeliusConfigured,
  rpcEndpoints,
  rpcFallbackStats,
} from "@/lib/solana/connection";
import { treasuryAddressFor } from "@/lib/solana/treasury";
import { processInboundEvent } from "@/lib/treasury/inbound";

export const dynamic = "force-dynamic";
/** Reprocessing can fetch and verify a transaction, so it needs room beyond the default. */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** Deposits the swap pipeline has not converted yet. */
const PENDING_FEE_STATUSES = ["received", "no_route", "below_minimum"] as const;

/**
 * GET /api/admin/treasury — the integration's control panel.
 *
 * Three things an operator needs when a deposit does not behave: which provider is actually
 * answering, what the webhook last delivered, and what happened to each transfer afterwards. The
 * last webhook payload is included verbatim, which is what makes a parser problem diagnosable
 * against a real body instead of a guess.
 *
 * Admin-only, and deliberately not cached: this is live operational state.
 */
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const [events, pendingFees, lastWebhook, health] = await Promise.all([
    db.treasuryInboundEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        eventKey: true,
        signature: true,
        direction: true,
        assetType: true,
        mint: true,
        symbol: true,
        amount: true,
        fromAddress: true,
        toAddress: true,
        kind: true,
        status: true,
        note: true,
        source: true,
        campaignId: true,
        feeDepositId: true,
        blockTime: true,
        createdAt: true,
      },
    }),
    db.feeDeposit.count({ where: { status: { in: [...PENDING_FEE_STATUSES] } } }),
    db.treasuryInboundEvent.findFirst({
      where: { source: "webhook" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, signature: true, raw: true },
    }),
    // A health check that hits the chain; a failure here is itself the signal, so it is caught
    // rather than allowed to blank the whole panel.
    getRpcHealth().catch((error) => ({
      error: error instanceof Error ? error.message : "RPC health check failed",
    })),
  ]);

  return NextResponse.json(
    {
      /*
       * Both wallets, named by role. `treasury` stays as the FIXED address for the admin panel's
       * existing read; `treasuries` is the full pair, which is what an operator needs when
       * deciding where to top up SOL or USDC.
       */
      treasury: treasuryAddressFor("FIXED"),
      treasuries: {
        fixed: treasuryAddressFor("FIXED"),
        fee: treasuryAddressFor("FEE"),
      },
      rpc: {
        chain: rpcEndpoints().map((endpoint) => endpoint.provider),
        heliusConfigured: isHeliusConfigured,
        alchemyConfigured: isAlchemyConfigured,
        /** Live counters: how often something other than the head of the chain answered. */
        fallbacks: rpcFallbackStats(),
        health,
      },
      webhook: {
        /** True once a signing key is set, which is what makes the endpoint accept deliveries. */
        secretConfigured: (process.env.ALCHEMY_WEBHOOK_SECRET ?? "").trim().length > 0,
        lastReceivedAt: lastWebhook?.createdAt.toISOString() ?? null,
        lastSignature: lastWebhook?.signature ?? null,
        /** The verbatim body of the most recent delivery, for parser debugging. */
        lastPayload: lastWebhook?.raw ?? null,
      },
      feeQueue: { pending: pendingFees },
      events,
    },
    { headers: NO_STORE },
  );
}

/**
 * POST /api/admin/treasury — replay one inbound event.
 *
 * `{ id, action: "reprocess" }` re-runs matching for a row that was recorded before a bag existed,
 * or one whose transfer had not confirmed yet. Idempotent by construction: the matching steps are
 * all upserts keyed on the signature, so replaying a row that has already been credited attaches
 * the existing record rather than creating a second one.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: unknown; action?: unknown }
    | null;

  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const action = typeof body?.action === "string" ? body.action : "reprocess";

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400, headers: NO_STORE });
  }

  if (action !== "reprocess") {
    return NextResponse.json(
      { error: `Unknown action "${action}". Supported: reprocess` },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await processInboundEvent(id, { force: true });
    return NextResponse.json({ ok: true, result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[api/admin/treasury] replay failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Replay failed" },
      { status: 500, headers: NO_STORE },
    );
  }
}
