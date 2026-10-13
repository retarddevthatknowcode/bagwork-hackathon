import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import { rpcEndpoints } from "@/lib/solana/connection";
import { processAlchemyWebhook } from "@/lib/treasury/inbound";

export const dynamic = "force-dynamic";
/** Classification can fetch and verify transactions, so it needs room beyond the default. */
export const maxDuration = 60;

/**
 * POST /api/webhooks/alchemy — Alchemy Address Activity deliveries for the Bagwork treasury.
 *
 * ## Verification
 *
 * Alchemy signs every delivery with HMAC-SHA256 over the **raw request body**, hex-encoded, in the
 * `X-Alchemy-Signature` header — no prefix, no timestamp. Two details matter and both are easy to
 * get wrong:
 *
 *   - The signature covers the exact bytes. This route reads `req.text()` and verifies *before*
 *     parsing, because a body that has been through `JSON.parse` and re-stringified will not match
 *     (key order, whitespace and unicode escaping all change), and the check would fail for every
 *     legitimate delivery.
 *   - The key is the **per-webhook signing key** from the webhook's detail page in the Alchemy
 *     dashboard, not the app's auth token.
 *
 * Fail-closed when no key is configured, in the same spirit as the fee-sync route: an endpoint that
 * can activate a funded bag must never be reachable anonymously, and "no secret set" is exactly
 * when it would be.
 *
 * ## Delivery semantics
 *
 * Processing is idempotent (`treasury_inbound_events.event_key` is unique), so a retry is free and
 * a duplicate is normal traffic rather than an error.
 *
 * Response codes are chosen so Alchemy's retry behaviour helps rather than hurts:
 *
 *   - `200` — delivered, whatever the payload turned out to be. A body we could not read will not
 *             read better on a retry; it is recorded and surfaced to an operator instead.
 *   - `400` — not JSON. Also not fixed by retrying.
 *   - `401` — bad signature. Never a legitimate retry.
 *   - `500` — we failed transiently (database down, treasury misconfigured). This *should* be
 *             retried, and is the only case where that is true.
 */

function webhookSecret(): string {
  return (process.env.ALCHEMY_WEBHOOK_SECRET ?? "").trim();
}

/** Constant-time HMAC comparison over the raw body. */
function hasValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;

  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = Buffer.from(signature.trim(), "utf8");
  const expected = Buffer.from(digest, "utf8");

  // Length check first: `timingSafeEqual` throws on a length mismatch, and the comparison is only
  // meaningless if the lengths already differ.
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

export async function POST(req: NextRequest) {
  const secret = webhookSecret();

  if (!secret) {
    console.error(
      "[api/webhooks/alchemy] rejected a delivery: ALCHEMY_WEBHOOK_SECRET is not set",
    );
    return NextResponse.json(
      {
        error:
          "This webhook is closed. Set ALCHEMY_WEBHOOK_SECRET to the webhook's signing key from the Alchemy dashboard.",
      },
      { status: 503 },
    );
  }

  const rawBody = await req.text();

  if (!hasValidSignature(rawBody, req.headers.get("x-alchemy-signature"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON" }, { status: 400 });
  }

  try {
    const report = await processAlchemyWebhook(payload);

    console.info("[api/webhooks/alchemy] processed a delivery", {
      eventId: report.eventId,
      type: report.webhookType,
      network: report.network,
      transfers: report.transfersSeen,
      recorded: report.recorded,
      duplicates: report.duplicates,
      unreadable: report.unreadable,
    });

    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The one case worth a retry: something on our side failed, not the payload.
    console.error("[api/webhooks/alchemy] failed to process a delivery", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Webhook processing failed",
        /** Which providers are configured, so a 500 is quicker to diagnose from the response. */
        rpcChain: rpcEndpoints().map((endpoint) => endpoint.provider),
      },
      { status: 500 },
    );
  }
}
