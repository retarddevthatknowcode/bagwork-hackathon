/**
 * End-to-end check of the admin campaign routes.
 *
 * Drives the real HTTP surface — login, create, edit, pause, resume, end — and asserts the two
 * things that are easy to get wrong and expensive to miss:
 *
 *  1. A bag created from the console behaves like any other bag: it appears in the public
 *     marketplace feed while it is running, and disappears when it is paused.
 *  2. Nothing about its origin leaks. The public payload carries no `createdByAdmin`.
 *
 * Run against a local server:
 *
 *   bun run verify:admin-campaigns
 *   VERIFY_BASE_URL=https://bagwork-eta.vercel.app bun run verify:admin-campaigns
 *
 * It leaves the bag it creates as a DRAFT, so a run is invisible on the public site. Repeated
 * runs do accumulate drafts in the console, so `--cleanup` deletes every bag this script has
 * ever made (matched on its title prefix *and* the internal flag, so nothing else can match):
 *
 *   bun scripts/verify-admin-campaigns.ts --cleanup
 */

import { db } from "@/lib/db";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3100";
const password = process.env.ADMIN_PASSWORD;

/** Deletes the bags previous runs left behind, then exits. */
async function cleanup() {
  const where = { createdByAdmin: true, title: { startsWith: "Verify Bag" } };
  const rows = await db.campaign.findMany({ where, select: { id: true, title: true } });
  if (rows.length === 0) {
    console.log("No verification bags to remove.");
  } else {
    // The audit rows cascade with the bag, so the change history goes too.
    const deleted = await db.campaign.deleteMany({ where });
    console.log(`Removed ${deleted.count} verification bag(s):`);
    for (const row of rows) console.log(`  ${row.id}  ${row.title}`);
  }
  await db.$disconnect();
}

if (process.argv.includes("--cleanup")) {
  await cleanup();
  process.exit(0);
}

if (!password) {
  console.error("ADMIN_PASSWORD is not set — put it in .env (it is what opens /adminportal).");
  process.exit(1);
}

/** The admin cookie is `Secure`, so it cannot travel through a plain-http client's cookie jar. */
let cookie = "";

async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

let failures = 0;

function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
}

interface AdminRow {
  id: string;
  title: string;
  status: string;
  budget: number;
  fundedAmount: number;
  slotsRemaining: number;
  createdByAdmin: boolean;
  projectName: string;
}

interface PublicCampaign {
  id: string;
  title: string;
  status: string;
  budget: number;
  [key: string]: unknown;
}

/** The public marketplace feed for one status filter. */
async function feed(status: string): Promise<PublicCampaign[]> {
  const res = await fetch(`${BASE}/api/campaigns?status=${status}`);
  const body = (await res.json()) as { campaigns: PublicCampaign[] };
  return body.campaigns ?? [];
}

/** The description every bag in this script uses — long enough for the 20-character minimum. */
const BRIEF =
  "Post a 30-60s clip showing the dApp Store install flow. Hook in the first two seconds, keep it vertical, and keep price talk out of it.";

async function main() {
  console.log(`Verifying admin campaigns against ${BASE}\n`);

  // ---- Sign in ---------------------------------------------------------------------------
  const login = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  check("admin login", login.status === 200 && cookie.startsWith("bagwork_admin="));

  // Deliberately a bare request: `api()` attaches the operator cookie once login has run.
  const unauthed = await fetch(`${BASE}/api/admin/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "should not be created" }),
  });
  check("create without the admin cookie is refused", unauthed.status === 401);

  // ---- Create ----------------------------------------------------------------------------
  const title = `Verify Bag ${Date.now().toString().slice(-6)}`;
  const created = await api<{ campaign: AdminRow }>("/api/admin/campaigns", {
    method: "POST",
    body: {
      title,
      projectName: "Solana Mobile",
      description: BRIEF,
      platforms: ["x", "tiktok"],
      token: { kind: "USDC" },
      chain: "solana",
      paymentModel: "FIXED",
      budget: 5000,
      fixedFee: 25,
      maxSubmissions: 120,
      maxPerCreator: 2,
      durationDays: 30,
      status: "DRAFT",
    },
  });
  const bag = created.body.campaign;
  check("create returns 201", created.status === 201, `status ${created.status}`);
  if (!bag?.id) {
    console.error("Create failed, cannot continue:", created.body);
    process.exit(1);
  }
  check("the bag is flagged internally", bag.createdByAdmin === true);
  check("a draft is not funded, so it cannot look payable", bag.fundedAmount === 0);

  // ---- A draft is invisible publicly ------------------------------------------------------
  const allFeed = await feed("ALL");
  check(
    "a draft is absent from the public feed",
    !allFeed.some((c) => c.id === bag.id),
  );

  // ---- Publish ---------------------------------------------------------------------------
  const published = await api<{ campaign: AdminRow; action: string }>(
    `/api/admin/campaigns/${bag.id}`,
    { method: "PATCH", body: { status: "LIVE" } },
  );
  check("publishing succeeds", published.status === 200, `status ${published.status}`);
  check("publishing is recorded as PUBLISH", published.body.action === "PUBLISH");
  check(
    "publishing funds the bag from its own budget",
    published.body.campaign?.fundedAmount === 5000,
    `fundedAmount ${published.body.campaign?.fundedAmount}`,
  );

  // ---- It looks like any other bag --------------------------------------------------------
  const asPublic = (await feed("LIVE")).find((c) => c.id === bag.id);
  check("a live operator bag appears in the marketplace feed", Boolean(asPublic));
  check(
    "the public payload carries no provenance flag",
    asPublic !== undefined && !("createdByAdmin" in asPublic),
    asPublic ? Object.keys(asPublic).join(", ") : "not in the feed",
  );

  // ---- Pause -----------------------------------------------------------------------------
  const paused = await api<{ action: string }>(`/api/admin/campaigns/${bag.id}`, {
    method: "PATCH",
    body: { status: "PAUSED" },
  });
  check("pausing is recorded as PAUSE", paused.body.action === "PAUSE");
  check(
    "a paused bag drops out of the feed",
    !(await feed("LIVE")).some((c) => c.id === bag.id),
  );
  check(
    "the status filter is not a public route to a paused bag",
    !(await feed("PAUSED")).some((c) => c.id === bag.id),
  );

  // ---- Resume, then edit the budget ------------------------------------------------------
  const resumed = await api<{ action: string }>(`/api/admin/campaigns/${bag.id}`, {
    method: "PATCH",
    body: { status: "LIVE" },
  });
  check("resuming is recorded as RESUME", resumed.body.action === "RESUME");

  const edited = await api<{ campaign: AdminRow; changed: string[] }>(
    `/api/admin/campaigns/${bag.id}`,
    {
      method: "PATCH",
      body: {
        title: `${title} (edited)`,
        projectName: "Solana Mobile",
        description: BRIEF,
        platforms: ["x"],
        token: { kind: "USDC" },
        chain: "solana",
        paymentModel: "FIXED",
        budget: 10000,
        fixedFee: 25,
        maxSubmissions: 120,
        maxPerCreator: 2,
        durationDays: 30,
        status: "LIVE",
      },
    },
  );
  check("a budget edit succeeds", edited.status === 200, `status ${edited.status}`);
  check(
    "raising the budget buys slots",
    (edited.body.campaign?.slotsRemaining ?? 0) > (bag.slotsRemaining ?? 0),
    `${bag.slotsRemaining} → ${edited.body.campaign?.slotsRemaining}`,
  );
  check(
    "the edit is diffed for the audit trail",
    (edited.body.changed ?? []).includes("budget") &&
      (edited.body.changed ?? []).includes("title"),
    (edited.body.changed ?? []).join(", "),
  );

  // ---- History ---------------------------------------------------------------------------
  const detail = await api<{ history: { action: string }[] }>(`/api/admin/campaigns/${bag.id}`);
  const actions = (detail.body.history ?? []).map((h) => h.action);
  check(
    "the trail covers create, publish, pause, resume and the edit",
    ["CREATE", "PUBLISH", "PAUSE", "RESUME", "UPDATE"].every((a) => actions.includes(a)),
    actions.join(", "),
  );

  // ---- End, then shelve it so nothing lingers publicly ------------------------------------
  const ended = await api<{ action: string }>(`/api/admin/campaigns/${bag.id}`, {
    method: "PATCH",
    body: { status: "ENDED" },
  });
  check("ending is recorded as END", ended.body.action === "END");
  check(
    "an ended bag stays visible as history",
    (await feed("ALL")).some((c) => c.id === bag.id),
  );

  const shelved = await api<{ campaign: AdminRow }>(`/api/admin/campaigns/${bag.id}`, {
    method: "PATCH",
    body: { status: "DRAFT" },
  });
  check(
    "the verification bag is put back to DRAFT",
    shelved.body.campaign?.status === "DRAFT",
    `status ${shelved.body.campaign?.status}`,
  );

  console.log(
    failures === 0
      ? `\nAll checks passed. Verification bag ${bag.id} was left as a DRAFT.`
      : `\n${failures} check(s) failed. Verification bag: ${bag.id}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});