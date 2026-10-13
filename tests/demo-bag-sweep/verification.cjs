/**
 * The demo-bag sweep — the rule that decides what is deleted from a live database, and the queries
 * that find it.
 *
 * Exercised against a fake client with the real `plan()`/`apply()` in the middle, because the rule
 * guards money-adjacent rows and because a database is exactly what the interesting cases do not
 * need: an owned bag that must be left alone, a bag matched only by its own copy, and the project a
 * deletion would leave behind. The fake stands in for Prisma (the queries themselves are the code
 * under test), and a second `plan()` after `apply()` proves the idempotence the script claims.
 *
 * Run:
 *   npx tsc src/lib/campaigns/demo-bag-sweep.ts --outDir tests/demo-bag-sweep/.compiled \
 *     --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
 *   node tests/demo-bag-sweep/verification.cjs
 */
const { createDemoBagSweep, isEmptyPlan } = require("./.compiled/demo-bag-sweep.js");

let pass = 0;
let fail = 0;
function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ""}`);
  }
}

/* ---- anchor: the fake's query matcher ---- */

/** The subset of Prisma's `where` this code uses, so the fake answers the way the database would. */
function matches(row, where) {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((clause) => matches(row, clause));
    if (key === "AND") return condition.every((clause) => matches(row, clause));

    const value = key.includes(".")
      ? key.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), row)
      : row[key];

    if (condition === null) return value === null;
    if (typeof condition !== "object") return value === condition;

    if ("equals" in condition) {
      return typeof value === "string" && condition.mode === "insensitive"
        ? value.toLowerCase() === String(condition.equals).toLowerCase()
        : value === condition.equals;
    }
    if ("in" in condition) {
      const list = condition.in.map((item) =>
        condition.mode === "insensitive" ? String(item).toLowerCase() : item,
      );
      const candidate =
        typeof value === "string" && condition.mode === "insensitive" ? value.toLowerCase() : value;
      return list.includes(candidate);
    }
    if ("notIn" in condition) return !condition.notIn.includes(value);
    if ("contains" in condition) {
      const haystack = String(value ?? "");
      const needle = String(condition.contains);
      return condition.mode === "insensitive"
        ? haystack.toLowerCase().includes(needle.toLowerCase())
        : haystack.includes(needle);
    }
    if ("none" in condition) return Array.isArray(value) && value.length === 0;
    if ("some" in condition) {
      return Array.isArray(value) && value.some((item) => matches(item, condition.some));
    }

    // A relation filter, e.g. `{ project: { name: ... } }`.
    return matches(value ?? {}, condition);
  });
}

/* ---- anchor: the fake client ---- */

/**
 * A Prisma stand-in that keeps the two tables in memory.
 *
 * `project.deleteMany` cascades the way the schema does — the campaign rows on a deleted project go
 * with it — because the sweep's orphan step depends on that: it re-asks the database whether a
 * project is empty, and a fake that forgot the cascade would answer the opposite way.
 */
function fakeDb({ projects, campaigns }) {
  let projectRows = projects.map((p) => ({ ...p }));
  let campaignRows = campaigns.map((c) => ({ ...c }));
  const deleted = { projects: [], campaigns: [] };

  const pick = (row, select) =>
    Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));

  /*
   * Relation filters are read off the row, so a row handed to `matches` has to carry its relations —
   * exactly what Prisma does when it translates `where: { campaigns: { none: {} } }` into SQL. Without
   * this the fake would quietly answer "no" to every nested filter, and a test against it would pass
   * for the wrong reason.
   */
  const projectView = (row) => ({ ...row, campaigns: campaignRows.filter((c) => c.projectId === row.id) });
  const campaignView = (row) => ({
    ...row,
    project: projectRows.find((p) => p.id === row.projectId) ?? {},
  });

  return {
    deleted,
    project: {
      async findMany(args = {}) {
        return projectRows
          .filter((row) => matches(projectView(row), args.where))
          .map((row) => {
            const onProject = campaignRows.filter((c) => c.projectId === row.id);
            if (args.select) {
              const out = pick(row, args.select);
              if (args.select.campaigns) {
                out.campaigns = onProject.map((c) => pick(c, args.select.campaigns.select));
              }
              return out;
            }
            const out = { ...row };
            if (args.include && args.include.campaigns) {
              const shape = args.include.campaigns.select;
              out.campaigns = onProject.map((c) => ({
                ...pick(c, Object.fromEntries(Object.entries(shape).filter(([k]) => k !== "_count"))),
                _count: { submissions: c.submissions.length },
              }));
            }
            return out;
          });
      },
      async deleteMany({ where }) {
        const ids = where.id.in;
        deleted.projects.push(...ids);
        const removed = projectRows.filter((row) => ids.includes(row.id));
        projectRows = projectRows.filter((row) => !ids.includes(row.id));
        campaignRows = campaignRows.filter((c) => !ids.includes(c.projectId)); // ON DELETE CASCADE
        return { count: removed.length };
      },
    },
    campaign: {
      async findMany(args = {}) {
        return campaignRows
          .filter((row) => matches(campaignView(row), args.where))
          .map((row) => {
            const project = projectRows.find((p) => p.id === row.projectId) ?? {};
            const shape = args.select ?? {};
            return {
              ...pick(
                row,
                Object.fromEntries(Object.entries(shape).filter(([k]) => k !== "project")),
              ),
              project,
              _count: { submissions: row.submissions.length },
            };
          });
      },
      async deleteMany({ where }) {
        const ids = where.id.in;
        deleted.campaigns.push(...ids);
        const removed = campaignRows.filter((row) => ids.includes(row.id));
        campaignRows = campaignRows.filter((row) => !ids.includes(row.id));
        return { count: removed.length };
      },
    },
  };
}

/* ---- anchor: the fixtures ---- */

const DEMO_MINT = "ANxPAY7a9pU4s275Za8BHQ6M5gxNMigcFanzRmpzWiuW";

const projects = [
  { id: "p_nova", name: "Nova Protocol", tokenSymbol: "NOVA", tokenMint: "So11111111111111111111111111111111111111112" },
  { id: "p_ember", name: "Solana Mobile", tokenSymbol: "EMBER", tokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { id: "p_flywheel", name: "Demo Flywheel", tokenSymbol: "DEMO", tokenMint: DEMO_MINT },
  { id: "p_ctst", name: "CTST Test Bag", tokenSymbol: "CTST", tokenMint: "mint-ctst" },
  // A real coin that happens to be called Nova, with an owner: the SKIP case.
  { id: "p_realnova", name: "Nova Coin", tokenSymbol: "NOVA", tokenMint: "mint-real-nova" },
  { id: "p_bonk", name: "Bonk", tokenSymbol: "BONK", tokenMint: "mint-bonk" },
];

const campaigns = [
  { id: "c_nova", projectId: "p_nova", title: "Show your first Nova swap — 60s clip contest", description: "Tell us about your first swap.", status: "LIVE", createdBy: null, createdByAdmin: false, submissions: [1, 2, 3] },
  { id: "c_ember", projectId: "p_ember", title: "Explain EmberSwap's fee split in your own words", description: "Break the fee split down.", status: "LIVE", createdBy: null, createdByAdmin: false, submissions: [] },
  { id: "c_demo", projectId: "p_flywheel", title: "DEMO — Flywheel bag: $DEMO trading fees fund this pot", description: "DEMO DATA — not a real campaign.", status: "LIVE", createdBy: null, createdByAdmin: false, submissions: [] },
  // On a project that is deleted whole: it goes with the project, never named.
  { id: "c_demo_draft", projectId: "p_flywheel", title: "Demo flywheel, second attempt", description: "Same pot, different words.", status: "DRAFT", createdBy: null, createdByAdmin: false, submissions: [] },
  { id: "c_ctst", projectId: "p_ctst", title: "Try the announcement board", description: "Community test bag — try the announcement board.", status: "LIVE", createdBy: null, createdByAdmin: false, submissions: [] },
  // The renamed-project case: a seeded title sitting on a project nothing else identifies.
  { id: "c_stray", projectId: "p_bonk", title: "Show your first Nova swap — 60s clip contest", description: "Left behind by the old seed.", status: "LIVE", createdBy: null, createdByAdmin: false, submissions: [] },
  // Demo copy on a real project, paused: deleted, but never listed as visible on Explore.
  { id: "c_paused_demo", projectId: "p_bonk", title: "Old demo test", description: "DEMO DATA — not a real campaign, paused.", status: "PAUSED", createdBy: null, createdByAdmin: false, submissions: [] },
  // A publisher's own bag on a coin called Nova. Must survive.
  { id: "c_owned_nova", projectId: "p_realnova", title: "Nova Coin launch clip", description: "A real publisher's bag on a real coin called Nova.", status: "LIVE", createdBy: "user_1", createdByAdmin: false, submissions: [] },
  { id: "c_bonk", projectId: "p_bonk", title: "Bonk meme marathon", description: "Post your best Bonk meme.", status: "LIVE", createdBy: "user_2", createdByAdmin: false, submissions: [] },
];

/* ---- anchor: the run ---- */

(async () => {
  const db = fakeDb({ projects, campaigns });
  const sweep = createDemoBagSweep(db);
  const plan = await sweep.plan();
  const ids = (rows) => rows.map((row) => row.id).sort();

  console.log("\n--- what the plan finds ---");
  check(
    "the three seeded projects are deleted whole",
    JSON.stringify(ids(plan.projects)) === JSON.stringify(["p_ember", "p_flywheel", "p_nova"]),
    ids(plan.projects),
  );
  check(
    "a real coin called Nova, with an owner, is skipped",
    plan.skipped.length === 1 && plan.skipped[0].name === "Nova Coin",
    plan.skipped,
  );
  check(
    "a seeded title on a renamed project is a stray",
    JSON.stringify(ids(plan.strays)) === JSON.stringify(["c_stray"]),
    ids(plan.strays),
  );
  check(
    "bags matched on their own copy alone are deleted",
    JSON.stringify(ids(plan.bags)) === JSON.stringify(["c_ctst", "c_paused_demo"]),
    ids(plan.bags),
  );
  check(
    "the CTST project is deleted once its only bag is gone",
    JSON.stringify(ids(plan.orphanProjects)) === JSON.stringify(["p_ctst"]),
    ids(plan.orphanProjects),
  );

  console.log("\n--- what Explore would show ---");
  check("every non-draft, non-paused bag is counted", plan.explore.total === 7, plan.explore.total);
  check(
    "the demo bags on Explore are named",
    plan.explore.demos.length === 6,
    plan.explore.demos.map((d) => d.title),
  );
  check(
    "a paused demo bag is not on Explore",
    !plan.explore.demos.some((d) => d.title === "Old demo test"),
    plan.explore.demos.map((d) => d.title),
  );
  check(
    "an owned bag wearing a demo ticker is reported, and marked as left alone",
    plan.explore.demos.some((d) => d.title === "Nova Coin launch clip" && d.owned && !d.deletable),
    plan.explore.demos,
  );
  check(
    "a publisher's own bag with no demo identifier is not reported",
    !plan.explore.demos.some((d) => d.title === "Bonk meme marathon"),
    plan.explore.demos.map((d) => d.title),
  );

  console.log("\n--- what it deletes ---");
  const removed = await sweep.apply(plan);
  check("three projects deleted", removed.projects === 3, removed.projects);
  check("one stray campaign deleted", removed.strays === 1, removed.strays);
  check("two demo bags deleted", removed.bags === 2, removed.bags);
  check("one emptied project deleted", removed.orphanProjects === 1, removed.orphanProjects);
  check(
    "the publisher's Nova Coin project is untouched",
    !db.deleted.projects.includes("p_realnova"),
    db.deleted.projects,
  );
  check(
    "the publisher's own campaigns are untouched",
    !db.deleted.campaigns.includes("c_owned_nova") && !db.deleted.campaigns.includes("c_bonk"),
    db.deleted.campaigns,
  );
  check(
    "the draft on a deleted project went with it, without being named",
    !db.deleted.campaigns.includes("c_demo_draft"),
    db.deleted.campaigns,
  );

  console.log("\n--- idempotence ---");
  const after = await sweep.plan();
  check("a second run finds nothing to delete", isEmptyPlan(after), {
    projects: after.projects.length,
    strays: after.strays.length,
    bags: after.bags.length,
    orphanProjects: after.orphanProjects.length,
  });
  check("Explore keeps the two real bags", after.explore.total === 2, after.explore.total);
  check(
    "the owned Nova bag is still reported as demo-looking, still left alone",
    after.explore.demos.length === 1 && after.explore.demos[0].title === "Nova Coin launch clip",
    after.explore.demos,
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
})();
