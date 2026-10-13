import { NextRequest, NextResponse } from "next/server";

import { isAdmin } from "../login/route";
import { db } from "@/lib/db";
import {
  createDemoBagSweep,
  isEmptyPlan,
  type DemoBagPlan,
} from "@/lib/campaigns/demo-bag-sweep";

export const dynamic = "force-dynamic";

/**
 * The demo-bag sweep, admin-gated by the `bagwork_admin` cookie (see `api/admin/login`).
 *
 * This exists because the database a deployed app writes to is often not reachable from the machine
 * an operator is sitting at: the CLI (`scripts/remove-demo-bags.ts`) needs `DATABASE_URL`, and the
 * live app already has it. Running the sweep here means the cleanup can always be done against the
 * database the live site actually reads, with no credentials copied anywhere.
 *
 * `GET` is read-only and answers "what would go, and would Explore still show any of it". It is the
 * default on purpose: an operator (or a curl) can look before anything is written. `POST` applies it,
 * and only with an explicit `{ confirm: true }` body — a destructive route should not be fireable by
 * a bare POST, and a malformed body must not be able to read as confirmation.
 *
 * The rule and the queries live in `@/lib/campaigns/demo-bag-sweep` — the same module the CLI uses,
 * so the two entry points cannot drift apart on what a demo bag is. The app's own client is passed in,
 * so this adds no second connection pool.
 */
/** The whole plan as JSON, without the transient fields a caller cannot act on. */
function describe(plan: DemoBagPlan) {
  return {
    empty: isEmptyPlan(plan),
    projectsMatched: plan.projectsMatched,
    projects: plan.projects,
    strays: plan.strays,
    bags: plan.bags,
    orphanProjects: plan.orphanProjects,
    skipped: plan.skipped,
    explore: plan.explore,
  };
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plan = await createDemoBagSweep(db).plan();
  return NextResponse.json(describe(plan), { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/admin/demo-bags — delete the demo bags, their dependents and the projects left empty.
 *
 * Returns the check *after* the write rather than the request, so the console cannot report a success
 * the database disagrees with; `removed` says what was actually deleted, not what was planned.
 * Idempotent: a second call finds nothing and applies nothing.
 */
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "confirm: true is required — this deletes campaigns, submissions and payouts" },
      { status: 400 },
    );
  }

  const sweep = createDemoBagSweep(db);
  const before = await sweep.plan();
  if (isEmptyPlan(before)) {
    return NextResponse.json(
      { applied: false, removed: null, before: describe(before) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const removed = await sweep.apply(before);

  return NextResponse.json(
    {
      applied: true,
      removed: {
        projects: removed.projects,
        strays: removed.strays,
        bags: removed.bags,
        orphanProjects: removed.orphanProjects,
        /** The campaigns that went, by name, so the console can show what it removed. */
        campaigns: removed.deletions.flatMap((project) =>
          project.campaigns.map((campaign) => `"${campaign.title}"`),
        ),
      },
      before: describe(before),
      /*
       * Re-planned after the write rather than assumed empty: the check that matters is what the
       * database holds now, not what the plan predicted.
       */
      after: describe(await sweep.plan()),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
