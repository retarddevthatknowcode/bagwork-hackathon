/**
 * Fee Redirect — detection, matching, and the safety of the conversion path.
 *
 * What this proves against the real database and the real Jupiter API:
 *   - a mint only funds bags that opted in
 *   - a deposit is recorded even when nothing can be done with it yet
 *   - a deposit that cannot be swapped credits **nothing** (the invariant that matters most: a
 *     bag's budget may only grow from USDC that actually arrived)
 *   - re-detecting the same transfer can never produce a second row
 *   - the Helius scan runs end to end
 *
 * What it deliberately does NOT prove: a swap that settles. The fee wallet holds no tokens, so the
 * real Jupiter quote, swap build, sign and send all run and then fail at simulation — which is
 * exactly the failure path, and it confirms nothing is credited when a swap does not land. Proving
 * the success path needs a funded wallet and a real launch.
 *
 * Run:
 *   npx tsc -p tests/fee-redirect/tsconfig.json
 *   node tests/fee-redirect/verification.cjs
 */
require("dotenv").config({ quiet: true });

/*
 * `tsc` resolves `@/...` for type-checking but does not rewrite the emitted `require` calls, so the
 * compiled modules still ask for `@/lib/db`. This maps those back onto the compiled flat tree.
 */
const path = require("path");
const Module = require("module");
const compiledRoot = path.join(__dirname, ".compiled");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (typeof request === "string" && request.startsWith("@/")) {
    const relative = request.replace(/^@\/lib\//, "").replace(/^@\//, "");
    request = path.join(compiledRoot, relative);
  }
  return resolveFilename.call(this, request, ...rest);
};

const { db } = require("./.compiled/db.js");
const { resolveCampaignForMint, swapAndCredit, syncFees } = require("./.compiled/fees/sync.js");

const ZERO = "11111111111111111111111111111111";
/** A real, liquid mint (BONK) that this wallet holds none of. */
const FEE_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${detail}` : ""}`);
  }
}

const TAG = `zz-fee-${Date.now()}`;
const emptyReport = () => ({
  scanned: 0,
  recorded: 0,
  alreadySeen: 0,
  swapped: 0,
  creditedUsdc: 0,
  noRoute: 0,
  belowMinimum: 0,
  unmatched: 0,
  failed: 0,
  errors: [],
});

(async () => {
  const publisher = await db.user.create({ data: { displayName: `${TAG} pub` } });
  const project = await db.project.create({
    data: {
      name: `${TAG} project`,
      tokenSymbol: `F${Date.now() % 10000}`,
      tokenMint: FEE_MINT,
      tokenDecimals: 6,
      tokenKind: "CUSTOM",
      treasury: ZERO,
    },
  });

  let campaign;
  let disabled;
  try {
    campaign = await db.campaign.create({
      data: {
        createdBy: publisher.id,
        projectId: project.id,
        title: `${TAG} fee bag`,
        description: "Fee Redirect fixture bag.",
        contentType: "SHILLING",
        rateType: "FIXED",
        paymentModel: "FIXED",
        ratePer1k: 0,
        maxPayout: 10,
        budget: 100,
        fundedAmount: 100,
        treasury: ZERO,
        platforms: ["x"],
        geo: ["GLOBAL"],
        status: "LIVE",
        slotsRemaining: 10,
        endsAt: new Date(Date.now() + 86400000),
        feeRedirectEnabled: true,
        feeRedirectPct: 50,
        feeMint: FEE_MINT,
      },
    });
    // A bag that did not opt in must never receive fees, even for the same mint.
    disabled = await db.campaign.create({
      data: {
        createdBy: publisher.id,
        projectId: project.id,
        title: `${TAG} non-fee bag`,
        description: "Fee Redirect disabled, same mint.",
        contentType: "SHILLING",
        rateType: "FIXED",
        paymentModel: "FIXED",
        ratePer1k: 0,
        maxPayout: 10,
        budget: 50,
        fundedAmount: 50,
        treasury: ZERO,
        platforms: ["x"],
        geo: ["GLOBAL"],
        status: "LIVE",
        slotsRemaining: 5,
        endsAt: new Date(Date.now() + 86400000),
        feeRedirectEnabled: false,
        feeMint: FEE_MINT,
      },
    });

    console.log("\n--- matching a deposit to a bag ---");
    const resolved = await resolveCampaignForMint(FEE_MINT);
    check("the opted-in bag is found", resolved?.id === campaign.id, resolved?.id);
    check("a bag that did not opt in is ignored", resolved?.id !== disabled.id, resolved?.id);
    const other = await resolveCampaignForMint("11111111111111111111111111111112");
    check("an unrelated mint matches nothing", other === null, String(other));

    console.log("\n--- a deposit is recorded before anything is swapped ---");
    const deposit = await db.feeDeposit.create({
      data: {
        signature: `${TAG}-sig-1`,
        campaignId: campaign.id,
        mint: FEE_MINT,
        symbol: "TEST",
        decimals: 6,
        rawAmount: "5000000000",
        tokenAmount: 5000,
        fromAddress: ZERO,
        toAddress: ZERO,
        status: "matched",
        receivedAt: new Date(),
      },
    });
    const stored = await db.feeDeposit.findUnique({ where: { id: deposit.id } });
    check("the raw amount is kept verbatim", stored?.rawAmount === "5000000000", stored?.rawAmount);
    check("it starts as matched, not credited", stored?.status === "matched", stored?.status);

    console.log("\n--- re-detecting the same transfer cannot double-record ---");
    let duplicateRejected = false;
    let duplicateMessage = "";
    try {
      await db.feeDeposit.create({
        data: {
          signature: `${TAG}-sig-1`,
          campaignId: campaign.id,
          mint: FEE_MINT,
          rawAmount: "5000000000",
          tokenAmount: 5000,
          fromAddress: ZERO,
          toAddress: ZERO,
          receivedAt: new Date(),
        },
      });
    } catch (error) {
      duplicateRejected = true;
      duplicateMessage = error instanceof Error ? error.message : String(error);
    }
    check("the same signature is refused by the database", duplicateRejected, duplicateMessage);
    check(
      "  via the unique index on signature",
      duplicateMessage.includes("fee_deposits_signature_key") ||
        duplicateMessage.includes("Unique constraint"),
      duplicateMessage,
    );

    console.log("\n--- an unswappable deposit credits NOTHING ---");
    const before = await db.campaign.findUnique({
      where: { id: campaign.id },
      select: { budget: true, feeRaisedUsdc: true, fundedAmount: true, slotsRemaining: true },
    });

    const report = emptyReport();
    await swapAndCredit(deposit.id, report);

    const after = await db.campaign.findUnique({
      where: { id: campaign.id },
      select: { budget: true, feeRaisedUsdc: true, fundedAmount: true, slotsRemaining: true },
    });
    const afterDeposit = await db.feeDeposit.findUnique({ where: { id: deposit.id } });

    check("budget is untouched", after.budget === before.budget, `${before.budget} -> ${after.budget}`);
    check("fees-raised is untouched", after.feeRaisedUsdc === before.feeRaisedUsdc);
    check("funded amount is untouched", after.fundedAmount === before.fundedAmount);
    check("slots are untouched", after.slotsRemaining === before.slotsRemaining);
    check("no USDC was credited", report.creditedUsdc === 0, String(report.creditedUsdc));
    check(
      "the deposit is left unswapped with a reason",
      afterDeposit.status !== "swapped" && Boolean(afterDeposit.swapError),
      `${afterDeposit.status}: ${afterDeposit.swapError}`,
    );
    console.log(`       (Jupiter said: ${afterDeposit.swapError})`);

    console.log("\n--- a deposit for a mint with no bag is kept, not credited ---");
    const orphan = await db.feeDeposit.create({
      data: {
        signature: `${TAG}-sig-2`,
        campaignId: null,
        mint: "So11111111111111111111111111111111111111112",
        rawAmount: "1",
        tokenAmount: 1,
        fromAddress: ZERO,
        toAddress: ZERO,
        status: "unmatched",
        receivedAt: new Date(),
      },
    });
    const orphanReport = emptyReport();
    await swapAndCredit(orphan.id, orphanReport);
    const orphanAfter = await db.feeDeposit.findUnique({ where: { id: orphan.id } });
    check("an unmatched deposit is not swapped", orphanAfter.status === "unmatched", orphanAfter.status);
    check("and credits nothing", orphanReport.creditedUsdc === 0);
    const stillDisabled = await db.campaign.findUnique({ where: { id: disabled.id } });
    check("the non-opted-in bag never received anything", stillDisabled.feeRaisedUsdc === 0);

    console.log("\n--- the detection scan runs end to end ---");
    const scan = await syncFees(5);
    check("the scan returns a report without throwing", typeof scan.scanned === "number");
    check(
      "it only credited against confirmed swaps",
      scan.creditedUsdc === 0,
      String(scan.creditedUsdc),
    );
    console.log(
      `       (scanned ${scan.scanned}, recorded ${scan.recorded}, swapped ${scan.swapped}, errors ${scan.errors.length})`,
    );
  } finally {
    const ids = [campaign?.id, disabled?.id].filter(Boolean);
    await db.feeDeposit.deleteMany({
      where: { OR: [{ campaignId: { in: ids } }, { signature: { startsWith: TAG } }] },
    });
    await db.campaign.deleteMany({ where: { id: { in: ids } } });
    await db.project.delete({ where: { id: project.id } });
    await db.user.delete({ where: { id: publisher.id } });
    const leftover = await db.feeDeposit.count({ where: { signature: { startsWith: TAG } } });
    console.log(`\nleftover fixture deposits: ${leftover}`);
    console.log(`PASS ${pass} / FAIL ${fail}`);
    await db.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})().catch(async (error) => {
  console.error("harness error:", error);
  await db.$disconnect();
  process.exit(2);
});

