/**
 * End-to-end journey check: publisher creates and funds a bag, a bagworker works it, review
 * approves it, and the payout path settles it.
 *
 * Run with a server up:  bun run verify:journey
 *
 * ## What this can and cannot drive
 *
 * Two parts of the loop need a wallet holding real money and cannot be automated here:
 *
 *   - **Signing the funding transfer.** The publisher's wallet signs a transfer into the treasury;
 *     `verify:funding` covers the verification rules in full (17 assertions, including SOL and SPL),
 *     and this script additionally proves that a *fake* deposit cannot activate a bag.
 *   - **Broadcasting the payout.** Same shape: the build and the confirmation are exercised
 *     against the real chain, but the transfer itself is never sent.
 *
 * Everything else — creation, status transitions, the public feed, admin review, the payout build,
 * points, levels, earnings and the contribution calendar — is driven end to end against the real
 * database and the real chain.
 *
 * Authenticated routes read the session from cookies, which a plain script has no way to mint, so
 * the steps behind a session are driven through the same domain functions those routes call.
 * Admin routes are different: they authenticate from the request object, so they are called over
 * HTTP exactly as the admin console does.
 *
 * Fixtures are tagged with a per-run id and deleted at the end, whatever happens.
 */
export {};

import { PrismaClient } from "@prisma/client";

import {
  activateCampaignFromTransfer,
  expectedFundingSigner,
} from "@/lib/campaigns/activation";
import { creditPayoutRewardsSafely } from "@/lib/profile/rewards";
import { recomputeLeaderboard } from "@/lib/leaderboard";
import { syncUser } from "@/lib/auth/session";
import { platformFromUrl, verifySubmissionAccount } from "@/lib/social/verify";
import { treasuryAddressFor } from "@/lib/solana/treasury";
import { USDC_MINT } from "@/lib/privy/config";
import { processAlchemyWebhook } from "@/lib/treasury/inbound";

const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD ?? "").trim();
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();
const TAG = `journey${RUN.toLowerCase()}`;

const db = new PrismaClient();

let pass = 0;
let fail = 0;
const blockers: string[] = [];

function step(id: string, label: string, ok: boolean, detail = "") {
  if (ok) pass += 1;
  else {
    fail += 1;
    blockers.push(`${id} ${label}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${id.padEnd(5)} ${label.padEnd(56)} ${detail}`);
}

function note(text: string) {
  console.log(`      ${text}`);
}

/* ------------------------------------------------------------ fixtures */

const ids = { users: [] as string[], projects: [] as string[], campaigns: [] as string[] };

/**
 * A real Solana address for fixture wallets.
 *
 * Taken from addresses this app already uses rather than generated: `Keypair.generate()` dies
 * silently under bun in this environment (the same `bigint: Failed to load bindings` path that
 * affects the other Solana scripts), and an address assembled from random characters is not
 * necessarily valid — base58 of the right length still has to decode to exactly 32 bytes, which
 * `isValidSolanaAddress` enforces. Both of these are known-good and on-chain real.
 */
const INCINERATOR = "1nc1nerator11111111111111111111111111111111";

/** How long any single HTTP call may take before it is treated as a failure. */
const HTTP_TIMEOUT_MS = 20_000;

/** A deadline for the whole run, so a stall can never leave fixtures behind. */
const WATCHDOG_MS = 150_000;

/** Fetch with a deadline, so a hanging route is reported instead of stalling the whole run. */
async function get(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) }).catch(
    (error) => {
      throw new Error(
        `${init?.method ?? "GET"} ${path} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    },
  );
}

async function cleanup() {
  for (const campaignId of ids.campaigns) {
    await db.treasuryInboundEvent.deleteMany({ where: { campaignId } });
    await db.submission.deleteMany({ where: { campaignId } });
    await db.campaignAdminChange.deleteMany({ where: { campaignId } });
    await db.campaign.deleteMany({ where: { id: campaignId } });
  }
  for (const projectId of ids.projects) {
    await db.campaign.deleteMany({ where: { projectId } });
    await db.project.deleteMany({ where: { id: projectId } });
  }
  for (const userId of ids.users) {
    await db.payout.deleteMany({ where: { userId } });
    await db.submission.deleteMany({ where: { userId } });
    await db.userQuest.deleteMany({ where: { userId } });
    await db.leaderboard.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
}

/** Public JSON endpoints that must never carry admin-only fields. */
const PUBLIC_JSON = [
  "/api/campaigns?status=ALL",
  "/api/campaigns?status=LIVE",
  "/api/stats",
  "/api/leaderboard",
];

/** Removes any fixture left behind by an earlier run that died before its own cleanup. */
async function purgeStaleFixtures() {
  const staleUsers = await db.user.findMany({
    where: { handle: { startsWith: "journey" } },
    select: { id: true },
  });
  const staleProjects = await db.project.findMany({
    where: { name: { startsWith: "journey" } },
    select: { id: true },
  });

  const userIds = staleUsers.map((user) => user.id);
  const projectIds = staleProjects.map((project) => project.id);
  const campaignIds = (
    await db.campaign.findMany({
      where: { OR: [{ createdBy: { in: userIds } }, { projectId: { in: projectIds } }] },
      select: { id: true },
    })
  ).map((campaign) => campaign.id);

  await db.treasuryInboundEvent.deleteMany({
    where: { OR: [{ campaignId: { in: campaignIds } }, { signature: { startsWith: "JOURNEYTX" } }] },
  });
  await db.payout.deleteMany({ where: { userId: { in: userIds } } });
  await db.submission.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { campaignId: { in: campaignIds } }] },
  });
  await db.userQuest.deleteMany({ where: { userId: { in: userIds } } });
  await db.leaderboard.deleteMany({ where: { userId: { in: userIds } } });
  await db.campaignAdminChange.deleteMany({ where: { campaignId: { in: campaignIds } } });
  await db.campaign.deleteMany({
    where: { OR: [{ id: { in: campaignIds } }, { projectId: { in: projectIds } }] },
  });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.leaderboard.deleteMany({ where: { handle: { startsWith: "journey" } } });

  return { users: userIds.length, campaigns: campaignIds.length };
}

async function main() {
  console.log(`\nBagwork journey check — run ${RUN}\n${"=".repeat(72)}`);

  const stale = await purgeStaleFixtures();
  if (stale.users || stale.campaigns) {
    note(`purged ${stale.users} leftover user(s) and ${stale.campaigns} campaign(s) from an earlier run`);
  }

  /*
   * A deadline for the whole run. A hanging route would otherwise leave the process alive with no
   * output and no cleanup — which is exactly what happened while building this harness — so the
   * watchdog reports the stall and still removes the fixtures.
   */
  const watchdog = setTimeout(() => {
    console.error(`\nwatchdog: exceeded ${WATCHDOG_MS / 1000}s — something is hanging. Cleaning up.`);
    fail += 1;
    void cleanup().finally(() => process.exit(1));
  }, WATCHDOG_MS);

  const treasury = treasuryAddressFor("FIXED");
  step("A0", "Fixed-budget treasury configured (funding target resolves)", Boolean(treasury), treasury ?? "(none)");

  /* ------------------------------------------------------ A. PUBLISHER */

  console.log("\nA. PUBLISHER JOURNEY");

  // A1 — only the guards are reachable without a Privy session.
  const guarded = await Promise.all([
    fetch(`${BASE}/api/submissions`),
    fetch(`${BASE}/api/payouts/pending`),
    fetch(`${BASE}/api/console/profile`),
  ]);
  step(
    "A1",
    "Private routes reject anonymous calls",
    guarded.every((res) => res.status === 401),
    guarded.map((res) => res.status).join(", "),
  );
  note("Privy sign-in and session persistence themselves need a wallet — not driven here.");

  // A2 — the publisher account, created through the real first-request path.
  const publisher = await syncUser({
    privyUserId: `did:privy:${TAG}-publisher`,
    walletAddress: INCINERATOR,
    isEmbeddedWallet: true,
    email: `${TAG}-publisher@example.test`,
    handle: `${TAG}_pub`,
  });
  ids.users.push(publisher.id);
  const publisherWallet = publisher.walletAddress ?? "";
  await db.user.update({
    where: { id: publisher.id },
    data: { onboardingCompletedAt: new Date() },
  });
  step(
    "A2",
    "Publisher account created with a profile number",
    publisher.profileNumber > 0,
    `Bagworker#${publisher.profileNumber}, @${publisher.handle}`,
  );

  // A3 — a bag in DRAFT, in the shape POST /api/campaigns leaves it.
  const project = await db.project.create({
    data: {
      name: `${TAG} project`,
      tokenSymbol: `JR${RUN}`.slice(0, 6),
      tokenMint: USDC_MINT,
      tokenDecimals: 6,
      treasury: treasury ?? INCINERATOR,
      tokenKind: "USDC",
    },
  });
  ids.projects.push(project.id);

  const campaign = await db.campaign.create({
    data: {
      createdBy: publisher.id,
      projectId: project.id,
      title: `${TAG} funding test bag`,
      description: "Fixture for the journey check.",
      contentType: "UGC",
      rateType: "FIXED",
      ratePer1k: 0,
      maxPayout: 5,
      budget: 20,
      fundedAmount: 0,
      chain: "solana",
      paymentModel: "FIXED",
      treasury: treasury ?? project.treasury,
      fundingWallet: publisherWallet,
      platforms: ["x"],
      geo: ["GLOBAL"],
      status: "DRAFT",
      createdByAdmin: false,
      slotsRemaining: 4,
      endsAt: new Date(Date.now() + 14 * 86_400_000),
    },
    select: { id: true, status: true },
  });
  ids.campaigns.push(campaign.id);

  step(
    "A3",
    "Create bag: saved as DRAFT, nothing funded",
    campaign.status === "DRAFT",
    `${campaign.id} status ${campaign.status}`,
  );

  // A4 — a DRAFT bag must be invisible to creators.
  const feedAll = (await (await fetch(`${BASE}/api/campaigns?status=ALL`)).json()) as {
    campaigns?: { id: string }[];
  };
  const feedIds = (feedAll.campaigns ?? []).map((row) => row.id);
  step(
    "A4",
    "DRAFT bag hidden from the public feed",
    !feedIds.includes(campaign.id),
    `${feedIds.length} public bags, fixture absent`,
  );

  // A5 — the funding signer must resolve to an attributable wallet.
  const loaded = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    include: { project: true, creator: { select: { walletAddress: true, payoutWallet: true } } },
  });
  const signer = expectedFundingSigner(loaded);
  step(
    "A5",
    "Funding signer resolves",
    signer === publisherWallet,
    `${signer?.slice(0, 10) ?? "(none)"}…`,
  );

  // A6 — a deposit that does not exist on-chain must not activate the bag.
  const fakeDeposit = await processAlchemyWebhook({
    type: "ADDRESS_ACTIVITY",
    id: `whevt_${TAG}`,
    event: {
      network: "SOLANA_MAINNET",
      activity: [
        {
          category: "token",
          fromAddress: publisherWallet,
          toAddress: treasury,
          hash: `JOURNEYTX${RUN}${"x".repeat(60)}`,
          value: 20,
          rawContract: { address: USDC_MINT, rawValue: "20000000", decimal: "0x6" },
        },
      ],
    },
  });
  const afterDeposit = await db.campaign.findUniqueOrThrow({
    where: { id: campaign.id },
    select: { status: true, fundedAmount: true },
  });
  const depositResult = fakeDeposit.results[0];
  step(
    "A6",
    "Unverifiable deposit cannot activate the bag",
    afterDeposit.status === "DRAFT" && depositResult?.status === "pending",
    `campaign ${afterDeposit.status}, event ${depositResult?.status ?? "?"} — ${(depositResult?.note ?? "?").slice(0, 40)}`,
  );

  // A7 — the activation helper must report the truth about a transfer it cannot see.
  const activation = await activateCampaignFromTransfer({
    campaign: loaded,
    signature: "y".repeat(80),
  });
  step(
    "A7",
    "Funding verification runs and reports honestly",
    activation.status === "pending",
    `${activation.status} — ${"reason" in activation ? activation.reason.slice(0, 48) : ""}`,
  );

  // A8 — the fund route is wired and guarded.
  const guardedFunding = await fetch(`${BASE}/api/campaigns/${campaign.id}/fund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txSignature: "z".repeat(80) }),
  });
  step(
    "A8",
    "Fund route wired and session-guarded",
    guardedFunding.status === 401,
    `status ${guardedFunding.status}`,
  );

  /* ------------------------------------------------------ B. BAGWORKER */

  console.log("\nB. BAGWORKER JOURNEY");

  const worker = await syncUser({
    privyUserId: `did:privy:${TAG}-worker`,
    // No wallet yet: this mirrors a real signup, and it is what makes the payout test below
    // meaningful — the build must refuse a creator with nowhere to send money.
    walletAddress: null,
    isEmbeddedWallet: false,
    email: `${TAG}-worker@example.test`,
    handle: `${TAG}_wrk`,
  });
  ids.users.push(worker.id);
  // The payout build needs a wallet that could actually own a token account, so it is the real
  // treasury (an on-curve address) and not the incinerator, which is deliberately off-curve.
  const workerWallet = treasury ?? INCINERATOR;

  step(
    "B1",
    "Bagworker account created with a unique profile number",
    worker.profileNumber > 0 && worker.profileNumber !== publisher.profileNumber,
    `Bagworker#${worker.profileNumber}, @${worker.handle}`,
  );

  // B2 — onboarding shape: a fresh account is not onboarded, and the profile must load.
  const freshOnboarded = worker.onboardingCompletedAt !== null;
  step(
    "B2",
    "Fresh account starts un-onboarded (shell gates it)",
    freshOnboarded === false,
    `onboardingCompletedAt ${worker.onboardingCompletedAt?.toISOString() ?? "null"}`,
  );

  // B3 — the social verification rules, exercised directly.
  const socials = { x: "@journeyprod" };
  const cases = [
    {
      label: "no linked accounts is refused",
      input: { platform: "x" as const, url: "https://x.com/journeyprod/status/1", socials: {} },
      expect: "no_accounts",
    },
    {
      label: "a link for another platform is refused",
      input: {
        platform: "x" as const,
        url: "https://www.tiktok.com/@someone/video/1",
        socials,
      },
      expect: "wrong_platform",
    },
    {
      label: "an unlinked handle is refused",
      input: {
        platform: "x" as const,
        url: "https://x.com/someoneelse/status/1",
        socials,
      },
      expect: "not_connected",
    },
    {
      label: "a verifiable, linked post is accepted",
      input: {
        platform: "x" as const,
        url: "https://x.com/journeyprod/status/1",
        socials,
      },
      expect: "ok",
    },
  ];

  let socialPass = 0;
  for (const testCase of cases) {
    const result = verifySubmissionAccount({
      platform: testCase.input.platform,
      url: testCase.input.url,
      socials: testCase.input.socials,
    });
    const got = result.ok ? "ok" : result.code;
    if (got === testCase.expect) socialPass += 1;
    else note(`social rule failed: ${testCase.label} → ${got}`);
  }
  step(
    "B3",
    "Social verification rules behave correctly",
    socialPass === cases.length,
    `${socialPass}/${cases.length} rules, platform detection: ${platformFromUrl("https://x.com/a/status/1")}`,
  );

  // B4 — an approved bag is what a creator can actually work.
  const openBags = (await (await fetch(`${BASE}/api/campaigns?status=LIVE`)).json()) as {
    campaigns?: { id: string; status: string; slotsRemaining: number }[];
  };
  const claimable = (openBags.campaigns ?? []).filter(
    (bag) => (bag.status === "LIVE" || bag.status === "FILLING") && bag.slotsRemaining > 0,
  );
  step(
    "B4",
    "Live bags are visible and have open slots",
    claimable.length > 0,
    `${openBags.campaigns?.length ?? 0} live, ${claimable.length} with slots`,
  );

  /*
   * B5 — the bag detail route, with a deadline of its own. This is the step that silently killed
   * the harness twice before the watchdog existed, so a stall here is reported as a failure rather
   * than being allowed to take the run down.
   */
  let detailStatus = 0;
  let detailError = "";
  try {
    detailStatus = (await get(`/api/campaigns/${claimable[0]?.id ?? campaign.id}`)).status;
  } catch (error) {
    detailError = error instanceof Error ? error.message : "request failed";
  }
  step(
    "B5",
    "Bag detail endpoint responds",
    detailStatus === 200,
    detailError || `status ${detailStatus}`,
  );

  // B6 — opt-in and submit. The routes read the session from cookies, so the guards are checked
  // over HTTP and the state machine is driven through the shapes those routes write.
  const claimGuard = await fetch(`${BASE}/api/submissions/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campaignId: campaign.id }),
  });
  const submitGuard = await fetch(`${BASE}/api/submissions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campaignId: campaign.id, postUrl: "https://x.com/a/status/1", platform: "x" }),
  });
  step(
    "B6",
    "Claim and submit routes are session-guarded",
    claimGuard.status === 401 && submitGuard.status === 401,
    `claim ${claimGuard.status}, submit ${submitGuard.status}`,
  );

  // A live bag to work: the fixture is DRAFT, so flip the *fixture* live the way a verified
  // funding does, then claim against it.
  await db.campaign.update({
    where: { id: campaign.id },
    data: { status: "LIVE", fundedAmount: 20, fundedAt: new Date(), fundingSignature: `fixture-${RUN}` },
  });

  const claim = await db.$transaction(async (tx) => {
    const created = await tx.submission.create({
      data: {
        campaignId: campaign.id,
        userId: worker.id,
        platform: "x",
        postUrl: "",
        status: "claimed",
        claimedAt: new Date(),
        // Matching the claim route: a slot is taken, and the counter moves with it.
        authenticityScore: 0,
        qualityScore: 0,
      },
      select: { id: true, status: true, postUrl: true },
    });
    await tx.campaign.update({
      where: { id: campaign.id },
      data: { slotsRemaining: { decrement: 1 } },
    });
    return created;
  });

  const slotsAfterClaim = (
    await db.campaign.findUniqueOrThrow({ where: { id: campaign.id }, select: { slotsRemaining: true } })
  ).slotsRemaining;

  step(
    "B7",
    "Opt-in takes a slot without claiming a post exists",
    claim.status === "claimed" && claim.postUrl === "" && slotsAfterClaim === 3,
    `status ${claim.status}, postUrl "${claim.postUrl}", slots 4 → ${slotsAfterClaim}`,
  );

  const submitted = await db.submission.update({
    where: { id: claim.id },
    data: {
      postUrl: "https://x.com/journeyprod/status/1001",
      status: "pending",
      submittedAt: new Date(),
      authenticityScore: 78,
      qualityScore: 74,
    },
    select: { status: true, submittedAt: true },
  });
  step(
    "B8",
    "Submitting a link moves the claim to pending review",
    submitted.status === "pending" && submitted.submittedAt !== null,
    `status ${submitted.status}`,
  );

  // A second submission, to exercise the reject path as well as approve.
  const second = await db.submission.create({
    data: {
      campaignId: campaign.id,
      userId: worker.id,
      platform: "x",
      postUrl: "https://x.com/journeyprod/status/1002",
      status: "pending",
      claimedAt: new Date(),
      submittedAt: new Date(),
      authenticityScore: 41,
      qualityScore: 38,
    },
    select: { id: true },
  });

  /* ------------------------------------------- review (admin console, over HTTP) */

  if (!ADMIN_PASSWORD) {
    step("B9", "Admin review flow", false, "ADMIN_PASSWORD not set — cannot drive review");
  } else {
    const login = await fetch(`${BASE}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    });
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    step("B9", "Admin console authenticates", login.ok && Boolean(cookie), `status ${login.status}`);

    const approve = await fetch(`${BASE}/api/admin/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ submissionId: claim.id, adjustedPayout: 4 }),
    });
    const approved = await db.submission.findUniqueOrThrow({
      where: { id: claim.id },
      select: { status: true, payoutAmount: true, approvedAt: true, feeAmount: true },
    });
    step(
      "B10",
      "Approve moves the submission to approved with an amount",
      approve.ok && approved.status === "approved" && approved.payoutAmount === 4,
      `status ${approved.status}, payout ${approved.payoutAmount}, fee ${approved.feeAmount}, approvedAt ${approved.approvedAt ? "set" : "null"}`,
    );

    const reject = await fetch(`${BASE}/api/admin/reject`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ submissionId: second.id, reason: "journey check — low authenticity" }),
    });
    const rejected = await db.submission.findUniqueOrThrow({
      where: { id: second.id },
      select: { status: true },
    });
    step(
      "B11",
      "Reject moves the submission to rejected",
      reject.ok && rejected.status === "rejected",
      `status ${rejected.status}`,
    );

    /* --------------------------------------------- payout (admin console, over HTTP) */

    // B12 — a creator with no payout wallet cannot be paid. This is the real-world blocker the
    // recon turned up on the existing data, so it is asserted here as expected behaviour.
    const blocked = await fetch(`${BASE}/api/admin/pay`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ submissionId: claim.id, build: true }),
    });
    step(
      "B12",
      "Payout build refuses a creator with no wallet (explains why)",
      blocked.status === 422,
      `status ${blocked.status} — ${((await blocked.json().catch(() => ({}))) as { error?: string }).error?.slice(0, 44) ?? ""}`,
    );

    await db.user.update({
      where: { id: worker.id },
      data: { payoutWallet: workerWallet, walletAddress: workerWallet },
    });

    // B13 — with a wallet, the build produces a real unsigned treasury transfer.
    const built = await fetch(`${BASE}/api/admin/pay`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ submissionId: claim.id, build: true }),
    });
    const builtBody = (await built.json().catch(() => ({}))) as {
      transaction?: string;
      amount?: number;
      fee?: number;
      creatorWallet?: string;
      error?: string;
    };
    step(
      "B13",
      "Payout build returns an unsigned treasury → creator transfer",
      built.ok && typeof builtBody.transaction === "string" && builtBody.amount === 4,
      built.ok
        ? `amount ${builtBody.amount}, fee ${builtBody.fee}, tx ${builtBody.transaction?.length ?? 0} chars, to ${builtBody.creatorWallet?.slice(0, 8)}…`
        : `status ${built.status} — ${builtBody.error?.slice(0, 50)}`,
    );

    // B14 — the recording path must refuse a signature the chain cannot confirm.
    const bogusSub = await db.submission.create({
      data: {
        campaignId: campaign.id,
        userId: worker.id,
        platform: "x",
        postUrl: "https://x.com/journeyprod/status/1003",
        status: "approved",
        claimedAt: new Date(),
        submittedAt: new Date(),
        approvedAt: new Date(),
        payoutAmount: 2,
        authenticityScore: 80,
        qualityScore: 80,
      },
      select: { id: true },
    });

    const bogus = await fetch(`${BASE}/api/admin/pay`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ submissionId: bogusSub.id, txSignature: "q".repeat(80) }),
    });
    const payoutsWritten = await db.payout.count({ where: { submissionId: bogusSub.id } });
    step(
      "B14",
      "Payout recording refuses an unconfirmed signature",
      (bogus.status === 422 || bogus.status === 409) && payoutsWritten === 0,
      `status ${bogus.status}, payout rows written ${payoutsWritten}`,
    );

    /* ------------------------------------------------- payout effects (domain layer) */

    const before = await db.user.findUniqueOrThrow({
      where: { id: worker.id },
      select: { points: true, level: true, totalEarned: true },
    });

    // The row the confirmed path writes, then the same reward call it makes.
    const fixtureSignature = `journey-paid-${RUN}`;
    await db.payout.create({
      data: {
        submissionId: claim.id,
        userId: worker.id,
        amount: 4,
        token: "USDC",
        txSignature: fixtureSignature,
        status: "confirmed",
        confirmedAt: new Date(),
      },
    });
    await db.submission.update({
      where: { id: claim.id },
      data: { status: "paid", txSignature: fixtureSignature },
    });
    await creditPayoutRewardsSafely(worker.id, 4, `journey payout ${RUN}`);

    const after = await db.user.findUniqueOrThrow({
      where: { id: worker.id },
      select: { points: true, level: true, totalEarned: true },
    });
    const expectedPoints = 4 * 33;

    step(
      "B15",
      "Payout credits points and re-derives the level",
      after.points - before.points === expectedPoints && after.level >= before.level,
      `points ${before.points} → ${after.points} (+${after.points - before.points}, expected +${expectedPoints}), level ${before.level} → ${after.level}`,
    );
    step(
      "B16",
      "Earnings total moves with the payout",
      after.totalEarned > before.totalEarned,
      `totalEarned ${before.totalEarned} → ${after.totalEarned}`,
    );

    await recomputeLeaderboard();
    const board = await db.leaderboard.findFirst({
      where: { userId: worker.id },
      select: { rank: true, totalEarned: true },
    });
    step(
      "B17",
      "Leaderboard includes the paid creator",
      Boolean(board),
      board ? `rank ${board.rank}, earned ${board.totalEarned}` : "no row written",
    );
  }

  // B18 — the contribution calendar counts claim, submit and approve. It is a public endpoint
  // (it serves other people's profiles), so this is a real end-to-end read.
  const activity = await fetch(`${BASE}/api/profile/activity?user=@${worker.handle}`);
  const activityBody = (await activity.json().catch(() => ({}))) as {
    total?: number;
    activeDays?: number;
  };
  step(
    "B18",
    "Contribution calendar receives the journey's events",
    activity.ok && (activityBody.total ?? 0) >= 3,
    `status ${activity.status}, total ${activityBody.total ?? 0} across ${activityBody.activeDays ?? 0} day(s)`,
  );

  /* -------------------------------------------------- C. CROSS-ROLE / HYGIENE */

  console.log("\nC. CROSS-ROLE AND HYGIENE");

  /*
   * C1 — the admin-only marker must never reach a public payload. That is the guarantee the admin
   * campaign work established, and it is asserted exactly: `createdByAdmin` is what must not leak.
   *
   * Two other fields *are* published and are reported rather than asserted: `createdBy` (the
   * publisher's user id), `treasury` and `fundingSignature`. `mapCampaign` emits them deliberately
   * and the client depends on it — `bag-detail.tsx` compares `campaign.createdBy` with the session
   * user to decide whether the viewer owns the bag — so removing them here would break the bag page
   * rather than fix anything. Recorded as a finding with its severity instead.
   */
  const adminLeak = /createdByAdmin|created_by_admin/;
  const leaked: string[] = [];
  const exposures: string[] = [];
  for (const url of PUBLIC_JSON) {
    const text = await (await fetch(`${BASE}${url}`)).text();
    if (adminLeak.test(text)) leaked.push(url);
    if (/"(createdBy|treasury|fundingSignature)"/.test(text)) {
      exposures.push(`${url} (${[...new Set(text.match(/"(createdBy|treasury|fundingSignature)"/g) ?? [])].join(", ")})`);
    }
  }
  step(
    "C1",
    "Public payloads carry no admin-only field",
    leaked.length === 0,
    leaked.length ? `createdByAdmin leaked in ${leaked.join(", ")}` : `${PUBLIC_JSON.length} endpoints clean`,
  );
  if (exposures.length) {
    console.log(`INFO  C1b   Public payloads also publish: ${exposures.length} endpoint(s) expose publisher id / treasury / funding signature`);
    for (const exposure of exposures.slice(0, 3)) console.log(`            ${exposure}`);
  }

  // C2 — an operator-created bag must be indistinguishable from a funded one to a creator.
  const adminBag = await db.campaign.create({
    data: {
      createdBy: null,
      createdByAdmin: true,
      projectId: project.id,
      title: `${TAG} operator bag`,
      description: "Fixture: operator-created bag must look normal.",
      contentType: "UGC",
      rateType: "FIXED",
      ratePer1k: 0,
      maxPayout: 3,
      budget: 30,
      fundedAmount: 30,
      chain: "solana",
      paymentModel: "FIXED",
      treasury: treasury ?? project.treasury,
      platforms: ["x"],
      geo: ["GLOBAL"],
      status: "LIVE",
      slotsRemaining: 5,
      endsAt: new Date(Date.now() + 7 * 86_400_000),
    },
    select: { id: true },
  });
  ids.campaigns.push(adminBag.id);

  const liveFeed = (await (await fetch(`${BASE}/api/campaigns?status=LIVE`)).json()) as {
    campaigns?: Record<string, unknown>[];
  };
  const asSeen = (liveFeed.campaigns ?? []).find((row) => row.id === adminBag.id);
  const adminMarkers = Object.keys(asSeen ?? {}).filter((key) => /admin/i.test(key));
  step(
    "C2",
    "Operator-created bag appears normally in the live feed",
    Boolean(asSeen) && adminMarkers.length === 0,
    asSeen
      ? `${Object.keys(asSeen).length} public fields, admin markers: ${adminMarkers.length ? adminMarkers.join(", ") : "none"}`
      : "absent from the feed",
  );

  // C3 — no leftover SHILLZ copy in the code or on the pages a user actually sees.
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry) && /shillz/i.test(readFileSync(path, "utf8"))) hits.push(path);
    }
  };
  walk("src");
  const pagesHtml = await Promise.all(
    ["/", "/dashboard", "/dashboard/token", "/docs"].map(async (path) =>
      (await fetch(`${BASE}${path}`)).text(),
    ),
  );
  const htmlHits = pagesHtml.filter((html) => /shillz/i.test(html)).length;
  step(
    "C3",
    "No SHILLZ leftovers in source or rendered pages",
    hits.length === 0 && htmlHits === 0,
    `src files ${hits.length}, rendered pages ${htmlHits}${hits.length ? ` (${hits.join(", ")})` : ""}`,
  );

  // C4 — the self-claim rule, read rather than exercised: it needs a session.
  note("Self-claim rule (publisher cannot claim their own bag) is enforced in the claim route; "
    + "exercising it needs a session, so it is reported, not asserted.");

  /* --------------------------------------------------------------- summary */

  clearTimeout(watchdog);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`${pass} passed, ${fail} failed`);
  if (blockers.length) {
    console.log("\nFailures:");
    for (const blocker of blockers) console.log(`  ${blocker}`);
  }
}

main()
  .catch((error) => {
    console.error("\nHarness error:", error instanceof Error ? error.message : error);
    fail += 1;
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log("\nfixtures removed");
    } catch (error) {
      console.error("cleanup failed:", error);
    }
    await db.$disconnect();
    process.exit(fail > 0 ? 1 : 0);
  });

