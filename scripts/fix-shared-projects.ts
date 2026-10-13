/**
 * Detaches bags that borrowed another owner's project identity.
 *
 * `POST /api/campaigns` used to attach a new bag to *any* Project row on the same mint, and a Project
 * row is where a bag's token name, symbol, colour and logo live. So the first bag on a mint owned that
 * identity for everybody: a publisher's brand-new USDC bag inherited the seeded demo project on that
 * mint, and a wrapped-SOL bag inherited the one on wrapped SOL. The create paths are fixed — a row is
 * now only reused within its own owner's bags — but bags created before that still point at the
 * borrowed row and keep rendering someone else's brand until they are moved.
 *
 * The demo rows themselves have since been deleted (`scripts/remove-demo-bags.ts`); this script is
 * what repaired the *real* bags that had been pointing at them, and it stays because the same
 * detachment is needed for any project two owners happen to share.
 *
 * What this does, per project shared by more than one owner:
 *
 *   - the **oldest** bag keeps the row: the identity was authored for it, and it is the only claim on
 *     it that is not a coincidence of the mint.
 *   - every **other owner's** bag gets a fresh Project row carrying the token's own on-chain metadata
 *     (from `KNOWN_TOKENS`, the same table the create form uses), a neutral brand colour and its own
 *     treasury. Its card then reads "USDC" because the bag is denominated in USDC — a fact — rather
 *     than a demo ticker because a seed happened to use that mint.
 *   - bags whose mint is not a known token are **reported and skipped**: their symbol cannot be
 *     recovered from the database (the old code never stored it), and inventing one is exactly the
 *     failure this script exists to undo.
 *
 * Idempotent: after a run every project has one owner, so a second run finds nothing to do. Nothing is
 * deleted.
 *
 * Run:  bun run db:fix:shared-projects            (dry run: prints the plan)
 *       bun run db:fix:shared-projects -- --apply
 */
import { PrismaClient } from "@prisma/client";

import { KNOWN_TOKENS } from "@/lib/campaigns/authoring";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

/**
 * Who a bag belongs to, for identity purposes.
 *
 * Three groups, and they are genuinely different: a publisher's bags, the operator's hand-made bags,
 * and the seed rows (nobody). Expressing that as one key is what makes "shared with another owner"
 * answerable.
 */
function ownerKey(campaign: { createdBy: string | null; createdByAdmin: boolean }): string {
  if (campaign.createdBy) return `user:${campaign.createdBy}`;
  return campaign.createdByAdmin ? "admin" : "seed";
}

/** The token a repaired row should describe itself as, or null when the mint is not a known one. */
function knownTokenFor(mint: string) {
  return Object.values(KNOWN_TOKENS).find((token) => token.mint === mint) ?? null;
}

async function main() {
  const campaigns = await db.campaign.findMany({
    select: {
      id: true,
      title: true,
      createdBy: true,
      createdByAdmin: true,
      createdAt: true,
      treasury: true,
      project: {
        select: { id: true, name: true, tokenSymbol: true, tokenMint: true, tokenKind: true },
      },
    },
    // Oldest first: within a shared project, position decides who keeps the row.
    orderBy: { createdAt: "asc" },
  });

  const byProject = new Map<string, typeof campaigns>();
  for (const campaign of campaigns) {
    const list = byProject.get(campaign.project.id) ?? [];
    list.push(campaign);
    byProject.set(campaign.project.id, list);
  }

  const repairs: { campaign: (typeof campaigns)[number]; name: string; symbol: string }[] = [];
  const skipped: { campaign: (typeof campaigns)[number]; reason: string }[] = [];

  for (const group of byProject.values()) {
    if (new Set(group.map(ownerKey)).size < 2) continue;

    const [keeper, ...rest] = group;
    for (const campaign of rest) {
      if (ownerKey(campaign) === ownerKey(keeper)) continue;

      const known = knownTokenFor(campaign.project.tokenMint);
      if (!known) {
        skipped.push({
          campaign,
          reason: `mint ${campaign.project.tokenMint} is not a known token, so its symbol cannot be recovered`,
        });
        continue;
      }
      repairs.push({ campaign, name: known.name, symbol: known.symbol });
    }
  }

  console.log(`projects: ${byProject.size}  ·  campaigns: ${campaigns.length}`);

  for (const { campaign, name, symbol } of repairs) {
    console.log(
      `  detach  "${campaign.title}"\n` +
        `            from  ${campaign.project.name} (${campaign.project.tokenSymbol})\n` +
        `            to    ${name} (${symbol})   [owner ${ownerKey(campaign)}]`,
    );
  }
  for (const { campaign, reason } of skipped) {
    console.log(`  SKIP    "${campaign.title}" — ${reason}`);
  }

  if (repairs.length === 0 && skipped.length === 0) {
    console.log("Nothing to do: every project has a single owner.");
    return;
  }

  if (!apply) {
    console.log("");
    console.log(`Dry run: ${repairs.length} bag(s) would be detached. Re-run with --apply to write.`);
    return;
  }

  let moved = 0;
  for (const { campaign, name, symbol } of repairs) {
    const known = knownTokenFor(campaign.project.tokenMint)!;

    const project = await db.project.create({
      data: {
        name,
        tokenSymbol: symbol,
        // The app's own brand colour, not another project's. A neutral placeholder that belongs to
        // nobody is the honest default for a bag whose owner never picked one.
        tokenColor: "#bdfe00",
        tokenMint: known.mint,
        tokenName: name,
        tokenDecimals: known.decimals,
        tokenLogoUrl: null,
        // Denomination is a fact about the bag, not a brand, so it carries over unchanged.
        tokenKind: campaign.project.tokenKind,
        // The wallet that custodies this bag's budget — its own, not the borrowed row's.
        treasury: campaign.treasury,
      },
      select: { id: true },
    });

    await db.campaign.update({
      where: { id: campaign.id },
      data: { projectId: project.id },
    });
    moved++;
  }

  console.log("");
  console.log(`Detached ${moved} bag(s).`);
  if (skipped.length) console.log(`${skipped.length} left alone — see SKIP above.`);
}

main()
  .catch((error) => {
    console.error("repair failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
