import type { PrismaClient } from "@prisma/client";

import {
  DEMO_COPY_FRAGMENTS,
  DEMO_MINTS,
  DEMO_NAMES,
  DEMO_SYMBOLS,
  DEMO_TITLES,
  TEST_TICKER,
  isDemoBag,
  isUnowned,
  shouldDelete,
} from "./demo-bag-identifiers";

/**
 * Finds the seeded demo bags, reports exactly what would go, and — only when asked — deletes them.
 *
 * Two entry points share this file, because a destructive rule must not exist twice:
 *
 *   - `scripts/remove-demo-bags.ts` — a CLI against whatever `DATABASE_URL` it is given.
 *   - `POST /api/admin/demo-bags` — an admin-gated route (and a button in the operator console) for
 *     the database the *deployed* app is already connected to. That is the one that matters when the
 *     database a live site writes to cannot be reached from the machine doing the cleanup.
 *
 * The client is passed in rather than constructed here: the route hands over the app's singleton (one
 * pool, already sized for the pooler) and the script hands over its own, so neither ends up with a
 * second connection pool it did not ask for.
 *
 * `plan()` is read-only and answers what an operator needs to see before anything is written: what
 * would be deleted, what is deliberately skipped, and whether a demo bag is still on Explore.
 * `apply(plan)` is the only function here that writes.
 *
 * What a deletion takes with it: a campaign cascades to its submissions (and therefore their payouts),
 * its community (and that community's members and messages) and its admin change log.
 * `FeeDeposit.campaignId` and `TreasuryInboundEvent.campaignId` are `ON DELETE SET NULL`, so a fee row
 * matched to one of these bags survives with no campaign — correct, because the deposit really did
 * happen on-chain and the row is the record of it.
 *
 * Idempotent: a second run finds nothing and says so.
 */
export type DemoBagClient = Pick<PrismaClient, "project" | "campaign">;

/** A campaign as the report needs it. Counts, never the whole row: the plan is printed and returned. */
export interface DemoBagCampaign {
  id: string;
  title: string;
  status: string;
  createdBy: string | null;
  createdByAdmin: boolean;
  submissions: number;
}

export interface DemoBagProject {
  id: string;
  name: string;
  tokenSymbol: string;
  campaigns: DemoBagCampaign[];
}

/** A project that will be left holding nothing once the demo bags above are gone. */
export interface DemoBagOrphan {
  id: string;
  name: string;
  tokenSymbol: string;
}

/** A project that matched the demo identifiers but is staying, and why it is staying. */
export interface DemoBagSkip {
  name: string;
  tokenSymbol: string;
  reason: string;
}

/**
 * A demo bag a public feed would still show.
 *
 * Read through the marketplace's own filter (not `DRAFT`, not `PAUSED`) so the answer is a statement
 * about Explore rather than about a table. Whole rows are counted, not only the demo ones, so the
 * report can say "Explore would show 12 bags and 3 of them are demo" instead of a bare boolean.
 */
export interface ExploreCheck {
  total: number;
  demos: {
    title: string;
    project: string;
    tokenSymbol: string;
    status: string;
    owned: boolean;
    deletable: boolean;
  }[];
}

export interface DemoBagPlan {
  projects: DemoBagProject[];
  strays: DemoBagCampaign[];
  bags: DemoBagCampaign[];
  orphanProjects: DemoBagOrphan[];
  skipped: DemoBagSkip[];
  /** How many project rows carry a demo identifier at all — the denominator for `skipped`. */
  projectsMatched: number;
  explore: ExploreCheck;
}

export interface DemoBagApplyResult {
  projects: number;
  strays: number;
  bags: number;
  orphanProjects: number;
  deletions: DemoBagProject[];
}

/** Nothing to do: a caller that sees this must not write anything. */
export function isEmptyPlan(plan: DemoBagPlan): boolean {
  return (
    plan.projects.length === 0 &&
    plan.strays.length === 0 &&
    plan.bags.length === 0 &&
    plan.orphanProjects.length === 0
  );
}


export function createDemoBagSweep(db: DemoBagClient) {
  /** Read-only: every query the sweep will act on, plus the public-surface check. */
  async function plan(): Promise<DemoBagPlan> {
    const projects = await db.project.findMany({
      where: {
        OR: [
          { tokenSymbol: { in: DEMO_SYMBOLS, mode: "insensitive" } },
          { name: { in: DEMO_NAMES, mode: "insensitive" } },
          // The flywheel seed's own mint: the one identifier an edit to the name or ticker cannot hide.
          { tokenMint: { in: DEMO_MINTS } },
        ],
      },
      include: {
        campaigns: {
          select: {
            id: true,
            title: true,
            createdBy: true,
            createdByAdmin: true,
            status: true,
            _count: { select: { submissions: true } },
          },
        },
      },
    });

    const projectsOut: DemoBagProject[] = [];
    const skipped: DemoBagSkip[] = [];

    for (const project of projects) {
      const owned = project.campaigns.filter((campaign) => !isUnowned(campaign));
      if (owned.length > 0) {
        skipped.push({
          name: project.name,
          tokenSymbol: project.tokenSymbol,
          reason: `${owned.length} campaign(s) on it belong to someone: ${owned
            .map((campaign) => `"${campaign.title}"`)
            .join(", ")}`,
        });
        continue;
      }
      projectsOut.push({
        id: project.id,
        name: project.name,
        tokenSymbol: project.tokenSymbol,
        campaigns: project.campaigns.map((campaign) => ({
          id: campaign.id,
          title: campaign.title,
          status: campaign.status,
          createdBy: campaign.createdBy,
          createdByAdmin: campaign.createdByAdmin,
          submissions: campaign._count.submissions,
        })),
      });
    }

    /*
     * Campaigns that carry a demo title but sit on a project this run is not deleting — the case a
     * project row was renamed. Scoped to unowned rows for the same reason as above.
     */
    const strayCampaigns = await db.campaign.findMany({
      where: { title: { in: DEMO_TITLES }, createdBy: null, createdByAdmin: false },
      select: { id: true, title: true, projectId: true, _count: { select: { submissions: true } } },
    });
    const deletingProjectIds = new Set(projectsOut.map((project) => project.id));
    const strays: DemoBagCampaign[] = strayCampaigns
      .filter((campaign) => !deletingProjectIds.has(campaign.projectId))
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        status: "unknown",
        createdBy: null,
        createdByAdmin: false,
        submissions: campaign._count.submissions,
      }));
    /*
     * A campaign is listed once. A stray usually also answers the "its own copy gives it away" query
     * below — its title is one of the seeded ones and a seeded title contains a seeded fragment — and
     * listing it twice would double-count it in every report while deleting it in one pass anyway.
     * The stray rule is the narrower of the two, so it wins.
     */
    const strayIds = new Set(strays.map((campaign) => campaign.id));

    /*
     * Campaigns whose own copy or ticker says what they are, whether or not their project matched.
     *
     * Queried by the database rather than filtered in memory, but `shouldDelete` runs over the result
     * as well so the predicate lives in exactly one place. Campaigns already leaving with a deletable
     * project are excluded, so nothing is deleted twice.
     */
    const fragmentMatches = DEMO_COPY_FRAGMENTS.flatMap((fragment) => [
      { title: { contains: fragment, mode: "insensitive" as const } },
      { description: { contains: fragment, mode: "insensitive" as const } },
      { project: { name: { contains: fragment, mode: "insensitive" as const } } },
    ]);

    const bags: DemoBagCampaign[] = (
      await db.campaign.findMany({
        where: {
          OR: [
            { title: { contains: TEST_TICKER, mode: "insensitive" } },
            { description: { contains: TEST_TICKER, mode: "insensitive" } },
            { project: { tokenSymbol: { in: [TEST_TICKER, ...DEMO_SYMBOLS], mode: "insensitive" } } },
            { project: { tokenMint: { in: DEMO_MINTS } } },
            ...fragmentMatches,
          ],
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          createdBy: true,
          createdByAdmin: true,
          projectId: true,
          project: { select: { id: true, name: true, tokenSymbol: true, tokenMint: true } },
          _count: { select: { submissions: true } },
        },
      })
    )
      .filter(
        (campaign) =>
          shouldDelete(campaign) &&
          !deletingProjectIds.has(campaign.projectId) &&
          !strayIds.has(campaign.id),
      )
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        createdBy: campaign.createdBy,
        createdByAdmin: campaign.createdByAdmin,
        submissions: campaign._count.submissions,
      }));

    /*
     * Projects that exist only to hold a demo bag.
     *
     * They are the orphan risk: deleting the campaign leaves the project row behind with nothing on
     * it. Only projects that match the demo identifiers *and* hold nothing but demo bags are
     * considered — a real publisher's project row, even one left empty, is never touched.
     */
    const testProjects = await db.project.findMany({
      where: {
        OR: [
          { tokenSymbol: { equals: TEST_TICKER, mode: "insensitive" } },
          { name: { contains: TEST_TICKER, mode: "insensitive" } },
          { name: { contains: "test bag", mode: "insensitive" } },
          { tokenMint: { in: DEMO_MINTS } },
        ],
      },
      select: {
        id: true,
        name: true,
        tokenSymbol: true,
        tokenMint: true,
        campaigns: {
          select: { title: true, description: true, createdBy: true, createdByAdmin: true },
        },
      },
    });
    const orphanProjects: DemoBagOrphan[] = testProjects
      .filter(
        (project) =>
          !deletingProjectIds.has(project.id) &&
          project.campaigns.every((campaign) =>
            shouldDelete({
              ...campaign,
              project: {
                tokenSymbol: project.tokenSymbol,
                name: project.name,
                tokenMint: project.tokenMint,
              },
            }),
          ),
      )
      .map((project) => ({
        id: project.id,
        name: project.name,
        tokenSymbol: project.tokenSymbol,
      }));

    return {
      projects: projectsOut,
      strays,
      bags,
      orphanProjects,
      skipped,
      projectsMatched: projects.length,
      explore: await exploreCheck(db),
    };
  }

  /**
   * Writes. Projects first: the campaign cascade does the rest, and deleting a campaign separately
   * from a project it is already leaving would be a second pass over rows that no longer exist.
   */
  async function apply(plan: DemoBagPlan): Promise<DemoBagApplyResult> {
    const removedProjects = plan.projects.length
      ? await db.project.deleteMany({ where: { id: { in: plan.projects.map((p) => p.id) } } })
      : { count: 0 };
    const removedStrays = plan.strays.length
      ? await db.campaign.deleteMany({ where: { id: { in: plan.strays.map((c) => c.id) } } })
      : { count: 0 };

    /*
     * Then the demo bags matched on their own copy, one campaign at a time — a project may be shared
     * with a real bag, which is exactly why it is not deleted here.
     */
    const removedBags = plan.bags.length
      ? await db.campaign.deleteMany({ where: { id: { in: plan.bags.map((c) => c.id) } } })
      : { count: 0 };

    /*
     * And finally the projects the demo bags left empty. Re-checked against the database rather than
     * trusting the plan: if anything else was on one of them, it stays.
     */
    const emptied = plan.orphanProjects.length
      ? await db.project.findMany({
          where: { id: { in: plan.orphanProjects.map((p) => p.id) }, campaigns: { none: {} } },
          select: { id: true },
        })
      : [];
    const removedOrphans = emptied.length
      ? await db.project.deleteMany({ where: { id: { in: emptied.map((p) => p.id) } } })
      : { count: 0 };

    return {
      projects: removedProjects.count,
      strays: removedStrays.count,
      bags: removedBags.count,
      orphanProjects: removedOrphans.count,
      deletions: plan.projects,
    };
  }

  return { plan, apply };
}

/**
 * What a public feed would show right now.
 *
 * The filter is the marketplace's own (`GET /api/campaigns` with `status=ALL` excludes exactly
 * `DRAFT` and `PAUSED`), and the question asked of each row is the wider `isDemoBag` rather than
 * `shouldDelete`: a demo bag that someone owns is still a demo bag on a public list, and the report
 * should say so even though the sweep would leave it alone.
 *
 * The real feed also takes at most 100 rows ordered by funded amount, so this is a superset of what
 * Explore renders — which is what makes a count of zero here a statement about Explore rather than
 * about the 100 rows someone happened to look at.
 */
async function exploreCheck(db: DemoBagClient): Promise<ExploreCheck> {
  const rows = await db.campaign.findMany({
    where: { status: { notIn: ["DRAFT", "PAUSED"] } },
    select: {
      title: true,
      description: true,
      status: true,
      createdBy: true,
      createdByAdmin: true,
      project: { select: { name: true, tokenSymbol: true, tokenMint: true } },
    },
  });

  return {
    total: rows.length,
    demos: rows
      .filter((row) => isDemoBag(row))
      .map((row) => ({
        title: row.title,
        project: row.project.name,
        tokenSymbol: row.project.tokenSymbol,
        status: row.status,
        owned: !isUnowned(row),
        deletable: shouldDelete(row),
      })),
  };
}
