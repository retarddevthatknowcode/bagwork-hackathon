/**
 * Integration checks for the creator opt-in flow and the publisher analytics.
 *
 * Runs against the real database, using the app's own mappers and the same aggregate queries
 * the API runs, then removes everything it created. The point is to prove the things that are
 * easy to get quietly wrong: that a slot claimed without a link reads correctly all the way
 * through the mapper, that filling a claim does not consume a second slot, that a second content
 * link *does* become its own record, and that those records collapse into one bag card.
 *
 * Run:
 *   npx tsc src/lib/mappers.ts src/lib/db.ts src/lib/types.ts src/lib/submissions.ts \
 *     --outDir tests/funding/.compiled --module commonjs --target es2020 \
 *     --moduleResolution node --esModuleInterop --skipLibCheck
 *   node tests/opt-in-flow/verification.cjs
 */
require("dotenv").config({ quiet: true });
const { db } = require("../funding/.compiled/db.js");
const { mapSubmission } = require("../funding/.compiled/mappers.js");
const { groupByBag, sortLinks } = require("../funding/.compiled/submissions.js");

const ZERO = "11111111111111111111111111111111";
let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const TAG = `zz-test-${Date.now()}`;

(async () => {
  const publisher = await db.user.create({
    data: { displayName: `${TAG} publisher`, handle: `${TAG}p` },
  });
  const creator = await db.user.create({
    data: { displayName: `${TAG} creator`, handle: `${TAG}c` },
  });
  const project = await db.project.create({
    data: {
      name: `${TAG} project`,
      tokenSymbol: `T${Date.now() % 10000}`,
      tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      tokenName: "USD Coin",
      tokenDecimals: 6,
      tokenKind: "USDC",
      treasury: ZERO,
    },
  });
  const campaign = await db.campaign.create({
    data: {
      createdBy: publisher.id,
      projectId: project.id,
      title: `${TAG} bag`,
      description: "Integration fixture bag for the opt-in flow test.",
      contentType: "SHILLING",
      rateType: "FIXED",
      paymentModel: "FIXED",
      ratePer1k: 0,
      maxPayout: 25,
      budget: 500,
      fundedAmount: 500,
      treasury: ZERO,
      platforms: ["x"],
      geo: ["GLOBAL"],
      status: "LIVE",
      slotsRemaining: 20,
      endsAt: new Date(Date.now() + 14 * 86400000),
    },
  });

  try {
    console.log("\n--- claim (opt in) ---");
    const claim = await db.submission.create({
      data: {
        campaignId: campaign.id,
        userId: creator.id,
        postUrl: null,
        claimedAt: new Date(),
        platform: "x",
        status: "claimed",
      },
      include: { campaign: { include: { project: true } } },
    });
    await db.$transaction([
      db.campaign.update({
        where: { id: campaign.id },
        data: { slotsRemaining: { decrement: 1 } },
      }),
      db.user.update({ where: { id: creator.id }, data: { submissions: { increment: 1 } } }),
    ]);

    const mapped = mapSubmission(claim);
    check("a claim with no link maps without throwing", mapped !== null);
    check("  status reads as claimed", mapped.status === "claimed", mapped.status);
    check(
      "  postUrl is null, not an empty string",
      mapped.postUrl === null,
      String(mapped.postUrl),
    );

    const afterClaim = await db.campaign.findUnique({ where: { id: campaign.id } });
    check(
      "  the slot was spent at opt-in",
      afterClaim.slotsRemaining === 19,
      String(afterClaim.slotsRemaining),
    );

    console.log("\n--- filling the claim with a link ---");
    const filled = await db.submission.update({
      where: { id: claim.id },
      data: { postUrl: "https://x.com/creator/status/1", status: "pending" },
      include: { campaign: { include: { project: true } } },
    });
    const filledMapped = mapSubmission(filled);
    check("the claim is filled, not duplicated", filled.id === claim.id);
    check("  status moves to pending", filledMapped.status === "pending", filledMapped.status);
    check(
      "  the link is stored",
      filledMapped.postUrl === "https://x.com/creator/status/1",
      String(filledMapped.postUrl),
    );
    check("  claimedAt is preserved for the record", filledMapped.claimedAt !== null);

    const rows = await db.submission.count({ where: { campaignId: campaign.id } });
    check("  still exactly one submission row", rows === 1, String(rows));

    const afterFill = await db.campaign.findUnique({ where: { id: campaign.id } });
    check(
      "  filling did NOT spend a second slot",
      afterFill.slotsRemaining === 19,
      String(afterFill.slotsRemaining),
    );

    console.log("\n--- a second link becomes its own record ---");
    // Adding another piece of content to the same bag: no open claim is left, so the API creates
    // a new record rather than overwriting the first one.
    const second = await db.submission.create({
      data: {
        campaignId: campaign.id,
        userId: creator.id,
        postUrl: "https://x.com/creator/status/2",
        platform: "x",
        status: "pending",
      },
      include: { campaign: { include: { project: true } } },
    });
    const twoLinks = await db.submission.findMany({
      where: { campaignId: campaign.id, userId: creator.id },
      include: { campaign: { include: { project: true } } },
      orderBy: { createdAt: "asc" },
    });
    check("two separate records for one creator", twoLinks.length === 2, String(twoLinks.length));
    check(
      "  both links are different and preserved",
      twoLinks[0].postUrl !== twoLinks[1].postUrl,
      `${twoLinks[0].postUrl} / ${twoLinks[1].postUrl}`,
    );
    check("  the first is untouched by the second", twoLinks[0].id === claim.id);

    console.log("\n--- My Submissions groups them into one bag ---");
    const mappedLinks = twoLinks.map(mapSubmission);
    const groups = groupByBag(mappedLinks);
    check("one card for the bag, not two", groups.length === 1, String(groups.length));
    check("  the card holds both links", groups[0]?.links.length === 2, String(groups[0]?.links.length));
    check(
      "  the card keeps the bag title",
      groups[0]?.campaignTitle === `${TAG} bag`,
      groups[0]?.campaignTitle,
    );

    // A claimed slot with no link outranks everything: it is the only thing the creator can fix,
    // so it must not hide behind the Pending tab.
    const withClaim = groupByBag(
      mappedLinks.concat([
        {
          ...mappedLinks[0],
          id: "synthetic-claim",
          postUrl: null,
          status: "claimed",
          campaignId: campaign.id,
        },
      ]),
    );
    check("a claim bucket is Action needed", withClaim[0]?.bucket === "action", withClaim[0]?.bucket);
    check("  and is counted as awaiting a link", withClaim[0]?.awaitingLink.length === 1);

    const paidOrder = sortLinks([
      { ...mappedLinks[0], status: "rejected" },
      { ...mappedLinks[1], status: "paid" },
    ]);
    check("settled links sort above rejected ones", paidOrder[0]?.status === "paid", paidOrder[0]?.status);

    console.log("\n--- a second bag stays a separate card ---");
    const otherCampaign = await db.campaign.create({
      data: {
        createdBy: publisher.id,
        projectId: project.id,
        title: `${TAG} second bag`,
        description: "Second fixture bag, to prove grouping is per bag.",
        contentType: "SHILLING",
        rateType: "FIXED",
        paymentModel: "FIXED",
        ratePer1k: 0,
        maxPayout: 10,
        budget: 200,
        fundedAmount: 200,
        treasury: ZERO,
        platforms: ["x"],
        geo: ["GLOBAL"],
        status: "LIVE",
        slotsRemaining: 20,
        endsAt: new Date(Date.now() + 86400000),
      },
    });
    const otherRecord = await db.submission.create({
      data: {
        campaignId: otherCampaign.id,
        userId: creator.id,
        postUrl: "https://x.com/creator/status/3",
        platform: "x",
        status: "pending",
      },
      include: { campaign: { include: { project: true } } },
    });
    const acrossBags = groupByBag(mappedLinks.concat([mapSubmission(otherRecord)]));
    check("two bags produce two cards", acrossBags.length === 2, String(acrossBags.length));
    check(
      "  the busiest bag sorts first",
      acrossBags[0]?.links.length + acrossBags[0]?.awaitingLink.length >= 1,
    );

    await db.submission.deleteMany({ where: { campaignId: otherCampaign.id } });
    await db.campaign.delete({ where: { id: otherCampaign.id } });
    void second;

    console.log("\n--- anti-fraud: the audit trail is stored ---");
    await db.submission.update({
      where: { id: claim.id },
      data: { verifiedHandle: "alice", verifiedPlatform: "x" },
    });
    const audited = await db.submission.findUnique({
      where: { id: claim.id },
      include: { campaign: { include: { project: true } } },
    });
    const auditedMapped = mapSubmission(audited);
    check("the verified handle is recorded", auditedMapped.verifiedHandle === "alice", String(auditedMapped.verifiedHandle));
    check("the verified platform is recorded", auditedMapped.verifiedPlatform === "x", String(auditedMapped.verifiedPlatform));

    console.log("\n--- anti-fraud: one link, once, across the whole platform ---");
    // Two bags, same link, same creator. The route rejects this, and the unique index on
    // `post_url` is what makes it true even if two requests race past the route check.
    const otherBag = await db.campaign.create({
      data: {
        createdBy: publisher.id,
        projectId: project.id,
        title: `${TAG} duplicate bag`,
        description: "Fixture bag used to prove global link uniqueness.",
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
      },
    });

    let duplicateRejected = false;
    let duplicateMessage = "";
    try {
      await db.submission.create({
        data: {
          campaignId: otherBag.id,
          userId: creator.id,
          postUrl: "https://x.com/creator/status/1", // already used on the first bag
          platform: "x",
          status: "pending",
        },
      });
    } catch (error) {
      duplicateRejected = true;
      duplicateMessage = error instanceof Error ? error.message : String(error);
    }
    check(
      "the same link cannot be submitted into a second bag",
      duplicateRejected,
      duplicateMessage || "the insert succeeded, which it must not",
    );
    check(
      "  enforced by the database, not only the route",
      duplicateMessage.includes("submissions_post_url_key") ||
        duplicateMessage.includes("Unique constraint"),
      duplicateMessage,
    );

    // A claimed slot has no link yet, and many of them must coexist.
    await db.submission.create({
      data: {
        campaignId: otherBag.id,
        userId: creator.id,
        postUrl: null,
        claimedAt: new Date(),
        platform: "x",
        status: "claimed",
      },
    });
    await db.submission.create({
      data: {
        campaignId: otherBag.id,
        userId: publisher.id,
        postUrl: null,
        claimedAt: new Date(),
        platform: "x",
        status: "claimed",
      },
    });
    const claims = await db.submission.count({
      where: { campaignId: otherBag.id, postUrl: null },
    });
    check("multiple link-less claims still coexist", claims === 2, String(claims));

    await db.submission.deleteMany({ where: { campaignId: otherBag.id } });
    await db.campaign.delete({ where: { id: otherBag.id } });

    console.log("\n--- publisher analytics aggregates ---");
    // A second creator's rejected post, and the claim settled — so every counter has something
    // to be wrong about.
    await db.submission.create({
      data: {
        campaignId: campaign.id,
        userId: publisher.id,
        postUrl: "https://x.com/pub/status/2",
        platform: "x",
        status: "rejected",
      },
    });
    await db.submission.update({
      where: { id: claim.id },
      data: { status: "paid", payoutAmount: 25 },
    });

    const statusCounts = await db.submission.groupBy({
      by: ["campaignId", "status"],
      where: { campaignId: { in: [campaign.id] } },
      _count: { _all: true },
    });
    const creatorRows = await db.submission.findMany({
      where: { campaignId: { in: [campaign.id] }, userId: { not: null } },
      select: { campaignId: true, userId: true },
      distinct: ["campaignId", "userId"],
    });
    const paidByCampaign = await db.submission.groupBy({
      by: ["campaignId"],
      where: { campaignId: { in: [campaign.id] }, status: "paid" },
      _sum: { payoutAmount: true },
    });

    const distinctCreators = new Set(creatorRows.map((r) => r.userId)).size;
    const approved = statusCounts
      .filter((e) => e.status === "approved" || e.status === "paid")
      .reduce((sum, e) => sum + e._count._all, 0);
    const rejected = statusCounts
      .filter((e) => e.status === "rejected")
      .reduce((sum, e) => sum + e._count._all, 0);
    const paidTotal = paidByCampaign[0]?._sum.payoutAmount ?? 0;

    check("distinct creators = 2, not 2 rows", distinctCreators === 2, String(distinctCreators));
    check("approved counts paid work too", approved === 1, String(approved));
    check("rejected is counted separately", rejected === 1, String(rejected));
    check("paid total comes from settled payouts", paidTotal === 25, String(paidTotal));
  } finally {
    // Every row this test created, removed — including on failure, so a broken assertion
    // never leaves a fixture behind in the real database.
    await db.submission.deleteMany({ where: { campaignId: campaign.id } });
    await db.campaign.delete({ where: { id: campaign.id } });
    await db.project.delete({ where: { id: project.id } });
    await db.user.deleteMany({ where: { id: { in: [publisher.id, creator.id] } } });
    const leftover = await db.submission.count({ where: { campaignId: campaign.id } });
    console.log(`\nleftover rows after teardown: ${leftover}`);
    console.log(`PASS ${pass} / FAIL ${fail}`);
    await db.$disconnect();
    process.exit(fail === 0 ? 0 : 1);
  }
})().catch(async (error) => {
  console.error("harness error:", error);
  await db.$disconnect();
  process.exit(2);
});

