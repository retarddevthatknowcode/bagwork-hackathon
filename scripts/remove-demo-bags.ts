/**
 * Deletes the seeded demo bags from the database `DATABASE_URL` points at.
 *
 * A CLI over `@/lib/campaigns/demo-bag-sweep`, which holds the rule and the queries; this file exists
 * for the operator who has the connection string. The same sweep is behind `POST /api/admin/demo-bags`
 * (and the Demo data panel in the operator console) for the database a *deployed* app is connected to
 * — reachable when the live database is not reachable from here. Both go through one rule.
 *
 * Which bags these are, and where each one came from, is documented in
 * `src/lib/campaigns/demo-bag-identifiers.ts`. In short: **NOVA** ("Nova Protocol") and **EMBER**
 * ("EmberSwap") from the deleted `prisma/seed-test-campaigns.ts`, **$DEMO** ("Demo Flywheel") from the
 * deleted `scripts/seed-demo-flywheel.ts` — the only one standing on a deterministic mint — and
 * **CTST**, which was made by hand through the app and has no seed and no code reference at all, so
 * this sweep is the only way it goes away.
 *
 * Why a script rather than a migration: a migration is replayed on every deploy and would have to
 * tolerate rows that do not exist, and this is one-off data, not schema. It is safe to run against any
 * database, including one that never had any of them.
 *
 * Idempotent: a second run finds nothing and says so.
 *
 * Run:  bun run db:remove:demo-bags            (dry run: prints what would go)
 *       bun run db:remove:demo-bags -- --apply
 */
import { PrismaClient } from "@prisma/client";

import {
  createDemoBagSweep,
  isEmptyPlan,
  type DemoBagPlan,
} from "../src/lib/campaigns/demo-bag-sweep";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

/** Prints the plan. The dry run is where a wrong match would show up, so nothing is summarised away. */
function report(plan: DemoBagPlan) {
  console.log(`demo projects found: ${plan.projectsMatched}`);

  for (const project of plan.projects) {
    const submissions = project.campaigns.reduce((sum, campaign) => sum + campaign.submissions, 0);
    console.log(
      `  DELETE  ${project.name} (${project.tokenSymbol}) — ` +
        `${project.campaigns.length} campaign(s), ${submissions} submission(s)`,
    );
    for (const campaign of project.campaigns) {
      console.log(`            "${campaign.title}" [${campaign.status}]`);
    }
  }
  for (const campaign of plan.strays) {
    console.log(
      `  DELETE  campaign "${campaign.title}" — ${campaign.submissions} submission(s), no owner`,
    );
  }
  for (const campaign of plan.bags) {
    console.log(
      `  DELETE  campaign "${campaign.title}" [${campaign.status}] — ` +
        `${campaign.submissions} submission(s) · ` +
        `owner ${campaign.createdBy ?? (campaign.createdByAdmin ? "admin" : "none")}`,
    );
  }
  for (const project of plan.orphanProjects) {
    console.log(
      `  DELETE  project ${project.name} (${project.tokenSymbol}) — nothing left on it once the ` +
        `demo bag above is gone`,
    );
  }
  for (const skip of plan.skipped) {
    console.log(`  SKIP    ${skip.name} (${skip.tokenSymbol}) — ${skip.reason}`);
  }

  /*
   * The public-surface check, printed every run: this is the line that answers "is it actually gone
   * from Explore", and it is the number to look at after `--apply`.
   */
  console.log(
    `explore check: ${plan.explore.total} bag(s) would be visible, ` +
      `${plan.explore.demos.length} of them demo`,
  );
  for (const demo of plan.explore.demos) {
    console.log(
      `  VISIBLE ${demo.title} — ${demo.project} (${demo.tokenSymbol}) [${demo.status}]` +
        (demo.deletable ? "" : " · owned, so the rule leaves it alone"),
    );
  }
}

async function main() {
  const sweep = createDemoBagSweep(db);
  const plan = await sweep.plan();

  report(plan);
  console.log("");

  if (isEmptyPlan(plan)) {
    console.log("Nothing to do: no demo bag is left in this database.");
    return;
  }

  const totalCampaigns = plan.strays.length + plan.bags.length;
  const totalProjects = plan.projects.length + plan.orphanProjects.length;

  if (!apply) {
    console.log(
      `Dry run: ${totalProjects} project(s) and ${totalCampaigns} campaign(s) would be deleted. ` +
        "Re-run with --apply to write.",
    );
    return;
  }

  const result = await sweep.apply(plan);
  console.log(
    `Deleted ${result.projects} seeded project(s) — with their campaigns, submissions, payouts, ` +
      `communities and admin log entries — plus ${result.strays} stray campaign(s), ` +
      `${result.bags} demo bag(s) matched on their own copy and ${result.orphanProjects} now-empty ` +
      "demo project(s).",
  );

  const after = await sweep.plan();
  console.log("");
  console.log(
    `explore check: ${after.explore.total} bag(s) would be visible, ` +
      `${after.explore.demos.length} of them demo.`,
  );
  console.log("A second run will report nothing to do.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
