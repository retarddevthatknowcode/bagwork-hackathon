import { NextRequest, NextResponse } from "next/server";
import type { User as PrivyUser } from "@privy-io/node";

import { getPrivyServer } from "@/lib/auth/privy-server";
import { envValue } from "@/lib/privy/config";
import { syncUserFromPrivyUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/privy — the server-side safety net for user identity.
 *
 * The session route (`/api/auth/session`) already materialises a user on the first authenticated
 * request. This is the **second** path to the same `syncUser`: if a browser closes, an identity
 * token never refreshes, or a wallet is linked from somewhere other than our own page, the delivery
 * still creates the row and fills in the default payout wallet. Both routes call the same function,
 * so a user looks identical whichever one got there first.
 *
 * ## Verification
 *
 * Privy delivers webhooks through Svix and signs them the Svix way: the signature is an HMAC-SHA256
 * over `{svix-id}.{svix-timestamp}.{raw body}`, base64-encoded, in `svix-signature`, and the secret
 * is the `whsec_…` value from the endpoint's detail page in the Privy dashboard. The Privy SDK
 * exposes the verifier (`privy.webhooks().verify(...)`), which also rejects stale timestamps — so it
 * is what this route uses rather than re-implementing the scheme. The signature covers the exact
 * bytes, which is why `req.text()` is read and verified *before* `JSON.parse`.
 *
 * **Fail-closed.** With no `PRIVY_WEBHOOK_SECRET` set, every delivery is refused with `503`. This
 * endpoint can write `payoutWallet`, and "no secret configured" is precisely the state in which an
 * anonymous delivery would pass for a real one.
 *
 * ## Response codes
 *
 *   - `200` — verified and either processed or deliberately ignored (an event type that is not ours).
 *   - `401` — missing/incorrect signature, or a stale timestamp. Never a legitimate retry.
 *   - `503` — the endpoint is closed (no secret) or Privy is unconfigured. Operator problem, not a
 *             payload one.
 *   - `500` — we failed transiently after verifying. The one case worth a retry.
 *
 * Idempotent by construction: `syncUser` is find-then-write and only backfills `payoutWallet` while
 * it is empty, so a redelivery — Svix retries, and duplicates are normal — cannot overwrite a
 * wallet the user has since chosen.
 */

function webhookSecret(): string {
  // Normalised like every other credential (`envValue`): quoting around a value pasted from
  // `.env.example` into a host's dashboard would otherwise make every signature check fail.
  return envValue(process.env.PRIVY_WEBHOOK_SECRET);
}

/**
 * The events that can carry a user we should materialise.
 *
 * `user.created` covers signup, `user.authenticated` covers a returning login, and the two account
 * events cover a wallet being linked *after* the account already exists — which is exactly the
 * "connect a wallet later and get a payout wallet" case this safety net is for.
 */
const SYNCED_EVENTS = new Set([
  "user.created",
  "user.authenticated",
  "user.linked_account",
  "user.wallet_created",
]);

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  const secret = webhookSecret();

  if (!secret) {
    console.error(
      "[api/webhooks/privy] rejected a delivery: PRIVY_WEBHOOK_SECRET is not set",
    );
    return NextResponse.json(
      {
        error:
          "This webhook is closed. Set PRIVY_WEBHOOK_SECRET to the signing secret from the Privy dashboard.",
      },
      { status: 503 },
    );
  }

  const privy = getPrivyServer();
  if (!privy) {
    console.error(
      "[api/webhooks/privy] rejected a delivery: Privy credentials are not configured",
    );
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  // Verify over the raw bytes — a body that has been through `JSON.parse` and re-stringified will
  // not match the signature (key order, whitespace and escaping all change).
  const rawBody = await req.text();

  let payload: unknown;
  try {
    payload = privy.webhooks().verify({
      payload: rawBody,
      headers: {
        "svix-id": req.headers.get("svix-id") ?? "",
        "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
        "svix-signature": req.headers.get("svix-signature") ?? "",
      },
      signing_secret: secret,
    });
  } catch (error) {
    console.error(
      "[api/webhooks/privy] rejected a delivery: signature verification failed",
      error,
    );
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const event = payload as { type?: string; user?: PrivyUser };
  const type = typeof event.type === "string" ? event.type : "";

  if (!SYNCED_EVENTS.has(type)) {
    // Acknowledged, not processed. Privy sends many event types; the rest are not ours, and a 4xx
    // would only make Svix retry something that will never be handled here.
    return NextResponse.json({ ok: true, ignored: true, type }, { headers: NO_STORE });
  }

  const user = event.user;
  if (!user || typeof user.id !== "string") {
    // Signed, and a type we care about, but without a user it cannot become a row. Ack it.
    return NextResponse.json(
      { ok: true, ignored: true, type, reason: "no user in payload" },
      { headers: NO_STORE },
    );
  }

  try {
    const row = await syncUserFromPrivyUser(user);

    console.info("[api/webhooks/privy] synced a user", {
      type,
      userId: row.id,
      hasWallet: Boolean(row.walletAddress),
      hasPayoutWallet: Boolean(row.payoutWallet),
    });

    return NextResponse.json(
      {
        ok: true,
        type,
        userId: row.id,
        walletAddress: row.walletAddress,
        payoutWallet: row.payoutWallet,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[api/webhooks/privy] failed to sync a user", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}
