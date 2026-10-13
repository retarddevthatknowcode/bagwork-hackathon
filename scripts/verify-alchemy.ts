/**
 * Verifies the Bagwork ↔ Alchemy integration end to end against a running server.
 *
 * Usage:
 *   bun run verify:alchemy
 *   BASE=https://bagwork-eta.vercel.app bun run verify:alchemy
 *
 * `ALCHEMY_WEBHOOK_SECRET` must match the value the server was started with, and
 * `TREASURY_WALLET_ADDRESS` (or `TREASURY_PRIVATE_KEY`) has to resolve to the watched treasury —
 * both are read from `.env` automatically.
 *
 * Everything checkable without an Alchemy account is checked here: the HMAC gate in both
 * directions, the tolerant parser, idempotency on replay, the ledger, the admin panel, and that the
 * token page still renders in Launching Soon mode. The fallback leg needs real RPC credentials and
 * is reported as skipped rather than pretended.
 */

export {};

import { createHmac } from "node:crypto";

const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const SECRET = (process.env.ALCHEMY_WEBHOOK_SECRET ?? "").trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD ?? "").trim();

/** Unique per run, so a repeat does not collide with the previous run's row. */
const RUN = Math.random().toString(36).slice(2, 8).toUpperCase();
const SIGNATURE = `ALCHEMYCHECK${RUN}${"x".repeat(64)}`;

let failures = 0;

function report(ok: boolean, label: string, detail: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(50)} ${detail}`);
}

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

async function postWebhook(body: string, signature: string | null) {
  const res = await fetch(`${BASE}/api/webhooks/alchemy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-alchemy-signature": signature } : {}),
    },
    body,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* a non-JSON response is reported verbatim below */
  }
  return { status: res.status, json, text };
}

/** The treasury address to watch, from whichever env var is set. */
async function resolveTreasury(): Promise<string | null> {
  const direct = (process.env.TREASURY_WALLET_ADDRESS ?? "").trim();
  if (direct) return direct;

  const res = await fetch(`${BASE}/api/treasury`).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as
    | { address?: unknown; treasury?: unknown }
    | null;
  const value = body?.address ?? body?.treasury;
  return typeof value === "string" && value ? value : null;
}

/** The documented Alchemy ADDRESS_ACTIVITY shape, carrying one inbound native transfer. */
function activityPayload(treasury: string, sender: string) {
  return JSON.stringify({
    webhookId: "wh_check_local",
    id: `whevt_check_${RUN}`,
    createdAt: new Date().toISOString(),
    type: "ADDRESS_ACTIVITY",
    event: {
      network: "SOLANA_MAINNET",
      activity: [
        {
          category: "external",
          fromAddress: sender,
          toAddress: treasury,
          hash: SIGNATURE,
          blockNum: "1",
          value: 0.25,
          asset: "SOL",
          rawContract: { rawValue: "250000000", decimal: "0x9" },
        },
      ],
    },
  });
}

async function main() {
  console.log(`\nAlchemy integration check against ${BASE}\n`);

  if (!SECRET) {
    failures += 1;
    console.log("FAIL  ALCHEMY_WEBHOOK_SECRET is not set — the webhook is closed (503) by design.");
    console.log("      Set it in .env and start the server with the same value.\n");
    return;
  }

  const treasury = await resolveTreasury();
  report(Boolean(treasury), "Treasury address resolves", treasury ?? "(none — check TREASURY_* env)");
  if (!treasury) return;

  // ---- the gate
  const goodBody = activityPayload(treasury, "11111111111111111111111111111111");

  const unsigned = await postWebhook(goodBody, null);
  report(unsigned.status === 401, "Unsigned delivery is rejected", `status ${unsigned.status}`);

  const misSigned = await postWebhook(goodBody, "deadbeef");
  report(misSigned.status === 401, "Wrong signature is rejected", `status ${misSigned.status}`);

  // ---- the happy path
  const first = await postWebhook(goodBody, sign(goodBody));
  const firstReport = (first.json as { report?: Record<string, unknown> } | null)?.report;
  report(
    first.status === 200 && firstReport?.recorded === 1,
    "Signed delivery is recorded",
    `status ${first.status}, recorded ${String(firstReport?.recorded)}, seen ${String(
      firstReport?.transfersSeen,
    )}`,
  );

  const classification = (
    firstReport?.results as { kind?: string; status?: string }[] | undefined
  )?.[0];
  report(
    classification?.kind === "unmatched" && classification?.status === "ignored",
    "Unknown mint is recorded, not acted on",
    `${classification?.kind ?? "?"} / ${classification?.status ?? "?"}`,
  );

  // ---- idempotency
  const replay = await postWebhook(goodBody, sign(goodBody));
  const replayReport = (replay.json as { report?: Record<string, unknown> } | null)?.report;
  report(
    replay.status === 200 && replayReport?.duplicates === 1 && replayReport?.recorded === 0,
    "Replay is idempotent (no second row)",
    `duplicates ${String(replayReport?.duplicates)}, recorded ${String(replayReport?.recorded)}`,
  );

  // ---- tolerant parsing
  const junk = '{ "unexpected": true }';
  const junkRes = await postWebhook(junk, sign(junk));
  const junkReport = (junkRes.json as { report?: Record<string, unknown> } | null)?.report;
  report(
    junkRes.status === 200,
    "Unrecognised shape is survivable",
    `status ${junkRes.status}, unreadable ${String(junkReport?.unreadable)}`,
  );

  // ---- admin panel
  const anon = await fetch(`${BASE}/api/admin/treasury`);
  report(anon.status === 401, "Admin treasury panel needs auth", `status ${anon.status}`);

  if (ADMIN_PASSWORD) {
    const login = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

    if (login.ok && cookie) {
      const panel = await fetch(`${BASE}/api/admin/treasury`, { headers: { cookie } });
      const body = (await panel.json().catch(() => null)) as {
        rpc?: { chain?: string[]; fallbacks?: { fallbacks?: number } };
        webhook?: { secretConfigured?: boolean };
        events?: { signature?: string }[];
      } | null;

      report(panel.ok, "Admin treasury panel loads", `status ${panel.status}`);
      report(
        Array.isArray(body?.rpc?.chain) && (body.rpc.chain?.length ?? 0) > 0,
        "Provider chain reported",
        (body?.rpc?.chain ?? []).join(" → ") || "(empty)",
      );
      report(
        body?.webhook?.secretConfigured === true,
        "Webhook reports its signing key as set",
        String(body?.webhook?.secretConfigured),
      );
      report(
        Boolean(body?.events?.some((event) => event.signature === SIGNATURE)),
        "Test transfer is in the ledger",
        `${SIGNATURE.slice(0, 16)}…`,
      );
    } else {
      report(false, "Admin login for the panel check", `status ${login.status}`);
    }
  } else {
    console.log("SKIP  Admin panel body check                ADMIN_PASSWORD not set");
  }

  // ---- the token page still works with no mint
  const tokenPage = await fetch(`${BASE}/dashboard/token`);
  const html = tokenPage.ok ? await tokenPage.text() : "";
  report(tokenPage.ok, "Token Analytics renders (Launching Soon)", `status ${tokenPage.status}`);
  report(
    html.includes("Launching Soon"),
    "Token Analytics shows the launch badge",
    html.includes("Launching Soon") ? "present" : "missing",
  );

  // ---- the routes this work touched must still be alive (auth-gated, so "not a 5xx" is the test)
  const smoke = async (label: string, url: string, init?: RequestInit) => {
    const res = await fetch(url, init).catch(() => null);
    const status = res?.status ?? 0;
    // 401/400/409/422 are all expected without a session or with a bogus input. A 5xx or a dead
    // connection is what a broken import or a bad wiring looks like.
    report(status > 0 && status < 500, label, `status ${status || "unreachable"}`);
  };

  await smoke("Funding route is alive", `${BASE}/api/campaigns/not-a-real-bag/fund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txSignature: "x".repeat(88) }),
  });
  await smoke("Payout route is alive", `${BASE}/api/payouts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ submissionId: "not-real", txSignature: "x".repeat(88) }),
  });
  await smoke("Treasury balance route is alive", `${BASE}/api/treasury`);

  // ---- the fallback leg, only when credentials exist
  const alchemyConfigured = Boolean(
    (process.env.ALCHEMY_RPC_URL ?? "").trim() || (process.env.ALCHEMY_API_KEY ?? "").trim(),
  );
  if (alchemyConfigured) {
    console.log("INFO  Alchemy credentials are set — confirm the fallback leg via the admin panel:");
    console.log("      GET /api/admin/treasury → rpc.chain and rpc.fallbacks.served");
  } else {
    console.log("SKIP  Alchemy fallback leg                  ALCHEMY_RPC_URL/ALCHEMY_API_KEY not set");
  }

  console.log(`\nTest signature: ${SIGNATURE}`);
  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`);
}

await main();
