/**
 * `profile_number` regression suite.
 *
 * Run with:  bun run verify:profile-number
 *
 * What this protects
 * ------------------
 * `users.profile_number` is NOT NULL, unique, and is the permanent public identity rendered as
 * `Bagworker#3578`. It used to be filled in only by `createUserRow` in `src/lib/auth/session.ts`
 * — the single place this app creates a user — which meant *any other writer* failed the insert
 * with
 *
 *   null value in column "profile_number" of relation "users" violates not-null constraint
 *
 * and took Profile and Onboarding down with it, because `syncUser` is the first thing every
 * authenticated route calls. An older deployment still serving traffic, a one-off script, or a
 * psql session were all enough to trigger it.
 *
 * The `profile_number_db_guarantee` migration moved the guarantee into the database: a
 * `next_profile_number()` allocator and a `BEFORE INSERT` trigger that fills the column in when
 * the writer left it out. Sections 2, 4 and 5 therefore test the guarantee *from the outside*,
 * as a writer that knows nothing about the column — which is exactly what the failing caller
 * was. Section 3 drives the application's real signup path, and section 6 proves the backfill
 * still repairs rows that predate the trigger — inside a transaction that is rolled back,
 * because this database has no NULLs left to repair and the check has to be honest about that
 * rather than skip itself.
 *
 * Runs under `bun` rather than tsc+node (the convention in `scripts/verify-funding.ts`) purely
 * because it imports `@/lib/auth/session` directly, and bun resolves the app's `@/` aliases and
 * its `next/headers` import outside a Next request. That import is the point of the suite: it
 * exercises the same `syncUser` the browser's onboarding hits.
 *
 * Every row it creates is marked in `privy_id` and deleted at the end. Nothing it does touches a
 * real profile, and a crash cannot leave anything behind that the marker cannot find.
 *
 * Expect it to take about a minute against the hosted database — it is ~50 round trips to
 * Supabase, and section 6 opens a transaction with DDL in it. That is a slow suite, not a hung
 * one; if it is ever killed halfway, the next run's cleanup collects the previous run's rows.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { syncUser, type VerifiedIdentity } from "@/lib/auth/session";
import {
  BAGWORKER_NUMBER_MAX,
  BAGWORKER_NUMBER_MIN,
  formatBagworkerNumber,
} from "@/lib/profile/points";

const db = new PrismaClient();

/** Marks every row this suite writes, so cleanup can never touch a real profile. */
const MARKER = "did:privy:verify-profile-number";

/** Ids this suite created, for cleanup. */
const created = new Set<string>();

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Rollback sentinel for section 6: the throw is what makes Prisma undo the transaction. */
class Rollback extends Error {}

function isUniqueViolation(error: unknown): boolean {
  // The message is checked first on purpose: a raw `$executeRaw` failure arrives as `P2010`
  // ("Raw query failed. Code: 23505"), not `P2002`, so testing the Prisma code alone reported a
  // correctly-rejected duplicate as a bug in this suite.
  if (
    /duplicate key value violates unique constraint|unique constraint failed|Code: `?23505/i.test(
      String(error),
    )
  ) {
    return true;
  }
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const inRange = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= BAGWORKER_NUMBER_MIN &&
  (value as number) <= BAGWORKER_NUMBER_MAX;

/**
 * Writes a `users` row the way an *old deployment* would: `profile_number` is absent from the
 * column list entirely. `updated_at` is the only other NOT NULL column without a default, so
 * omitting both is the worst case a caller can present.
 */
async function insertWithoutNumber(suffix: string, attempt = 0): Promise<string> {
  const id = `vpn_${suffix}_${attempt}`;
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "users" ("id", "privy_id", "handle", "updated_at") VALUES ($1, $2, $3, now())`,
      id,
      `${MARKER}-${suffix}`,
      `verify_${suffix}`,
    );
  } catch (error) {
    // Two concurrent inserts can draw the same random number and the unique index refuses the
    // second one. The app treats that as a retry (`createUserRow`); so does the suite, otherwise
    // it would report a flake as a regression.
    if (attempt < 3 && isUniqueViolation(error)) return insertWithoutNumber(suffix, attempt + 1);
    throw error;
  }
  created.add(id);
  return id;
}

const columnState = () =>
  db.$queryRawUnsafe<{ is_nullable: string; column_default: string | null }[]>(
    `SELECT is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profile_number'`,
  );

async function main() {
  const runId = Date.now().toString(36);
  // Real profiles only: a row left behind by an earlier crashed run is this suite's mess, not
  // part of the baseline, and cleanup below will collect it.
  const realProfiles = () =>
    db.user.count({ where: { NOT: { privyId: { startsWith: MARKER } } } });
  const totalBefore = await realProfiles();

  console.log("\n# 1. the constraint, as the database now states it\n");

  const [column] = await columnState();
  check(
    "profile_number exists and is NOT NULL",
    column?.is_nullable === "NO",
    `is_nullable=${column?.is_nullable}`,
  );

  const triggers = await db.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
    `SELECT t.tgname, t.tgenabled
     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'users' AND NOT t.tgisinternal`,
  );
  check(
    "the BEFORE INSERT trigger is installed and enabled",
    triggers.some((t) => t.tgname === "users_assign_profile_number" && t.tgenabled === "O"),
    `triggers: ${triggers.map((t) => t.tgname).join(", ") || "none"}`,
  );

  const indexes = await db.$queryRawUnsafe<{ indexdef: string }[]>(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'users_profile_number_key'`,
  );
  check(
    "a unique index is the final word on duplicates",
    /UNIQUE/i.test(indexes[0]?.indexdef ?? ""),
    indexes[0]?.indexdef ?? "index missing",
  );

  const [{ nulls }] = await db.$queryRawUnsafe<{ nulls: number }[]>(
    `SELECT count(*)::int AS nulls FROM "users" WHERE "profile_number" IS NULL`,
  );
  check("no row is left without a number", nulls === 0, `${nulls} row(s) still NULL`);

  console.log("\n# 2. the reported failure: a writer that omits the column\n");

  const orphanId = await insertWithoutNumber(`old-bundle-${runId}`);
  const orphan = await db.user.findUnique({ where: { id: orphanId } });
  check(
    "an insert that omits profile_number succeeds instead of raising a not-null violation",
    orphan !== null,
  );
  check(
    "and the database filled it in with a 4-digit number",
    inRange(orphan?.profileNumber),
    `profile_number=${orphan?.profileNumber}`,
  );
  check(
    "which renders as the identity format the UI shows",
    inRange(orphan?.profileNumber) &&
      formatBagworkerNumber(orphan.profileNumber) === `Bagworker#${orphan.profileNumber}`,
  );

  console.log("\n# 3. the application's own signup path (the real syncUser)\n");

  const identity: VerifiedIdentity = {
    privyUserId: `${MARKER}-signup-${runId}`,
    walletAddress: null,
    isEmbeddedWallet: false,
    email: null,
    handle: "verify_signup",
  };

  const signup = await syncUser(identity);
  created.add(signup.id);
  check(
    "a brand-new signup is created with a number in range",
    inRange(signup.profileNumber),
    `profile_number=${signup.profileNumber}`,
  );
  check(
    "and that number is not the one handed to the old-writer row",
    signup.profileNumber !== orphan?.profileNumber,
  );

  const returnVisit = await syncUser(identity);
  check(
    "a returning visit reuses the same row and never rewrites the number",
    returnVisit.id === signup.id && returnVisit.profileNumber === signup.profileNumber,
    `${returnVisit.id} / ${returnVisit.profileNumber}`,
  );

  const secondSignup = await syncUser({
    ...identity,
    privyUserId: `${MARKER}-signup-b-${runId}`,
    handle: "verify_signup_b",
  });
  created.add(secondSignup.id);
  check(
    "a second signup in the same second gets a different number",
    secondSignup.profileNumber !== signup.profileNumber,
    `${signup.profileNumber} vs ${secondSignup.profileNumber}`,
  );

  // The profile PATCH route (`/api/profile`) must never be able to move the number.
  const edited = await db.user.update({
    where: { id: signup.id },
    data: { displayName: "Verify", bio: "edited by the suite" },
  });
  check(
    "editing a profile — the onboarding save — leaves the permanent number untouched",
    edited.profileNumber === signup.profileNumber,
  );

  console.log("\n# 4. concurrent writers (the duplicate-avoidance requirement)\n");

  const parallel = await Promise.all(
    Array.from({ length: 5 }, (_, i) => insertWithoutNumber(`parallel-${i}-${runId}`)),
  );
  const parallelRows = await db.user.findMany({
    where: { id: { in: parallel } },
    select: { profileNumber: true },
  });
  const parallelNumbers = parallelRows.map((row) => row.profileNumber);
  check(
    "5 concurrent inserts that omit the column each get a number",
    parallelRows.length === 5 && parallelNumbers.every(inRange),
    `values: ${parallelNumbers.join(", ")}`,
  );
  check(
    "and every one of those numbers is distinct",
    new Set(parallelNumbers).size === parallelNumbers.length,
    `values: ${parallelNumbers.join(", ")}`,
  );

  console.log("\n# 5. an explicit number is honoured, a duplicate is refused\n");

  const used = new Set(
    (await db.user.findMany({ select: { profileNumber: true } })).map((row) => row.profileNumber),
  );
  let explicit = BAGWORKER_NUMBER_MAX;
  while (used.has(explicit)) explicit--;

  const explicitId = `vpn_explicit_${runId}`;
  await db.$executeRawUnsafe(
    `INSERT INTO "users" ("id", "privy_id", "handle", "updated_at", "profile_number")
     VALUES ($1, $2, $3, now(), $4)`,
    explicitId,
    `${MARKER}-explicit-${runId}`,
    "verify_explicit",
    explicit,
  );
  created.add(explicitId);
  const explicitRow = await db.user.findUnique({ where: { id: explicitId } });
  check(
    "the number the application chose is the number that is stored",
    explicitRow?.profileNumber === explicit,
    `expected ${explicit}, stored ${explicitRow?.profileNumber}`,
  );

  let refused = false;
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "users" ("id", "privy_id", "handle", "updated_at", "profile_number")
       VALUES ($1, $2, $3, now(), $4)`,
      `vpn_duplicate_${runId}`,
      `${MARKER}-duplicate-${runId}`,
      "verify_duplicate",
      explicit,
    );
  } catch (error) {
    refused = isUniqueViolation(error);
  }
  check("a duplicate number is refused by the unique index", refused);

  console.log("\n# 6. the backfill of rows that predate the trigger\n");

  const backfillId = `vpn_backfill_${runId}`;
  let repaired: number | null = null;
  let rolledBack = false;

  try {
    await db.$transaction(
      async (tx) => {
        // A row written before the trigger existed: NULL, allowed by a column that had not been
        // constrained yet. Every statement here is undone by the rollback below, so this proves
        // the repair works without leaving the live table nullable or gaining a stray row.
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
        await tx.$executeRawUnsafe(
          `ALTER TABLE "users" DISABLE TRIGGER users_assign_profile_number`,
        );
        await tx.$executeRawUnsafe(
          `ALTER TABLE "users" ALTER COLUMN "profile_number" DROP NOT NULL`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "users" ("id", "privy_id", "handle", "updated_at", "profile_number")
           VALUES ($1, $2, $3, now(), NULL)`,
          backfillId,
          `${MARKER}-backfill-${runId}`,
          "verify_backfill",
        );

        // The exact statement the migration runs.
        await tx.$executeRawUnsafe(
          `UPDATE "users" SET "profile_number" = public.next_profile_number()
           WHERE "profile_number" IS NULL`,
        );

        const rows = await tx.$queryRawUnsafe<{ profile_number: number | null }[]>(
          `SELECT "profile_number" FROM "users" WHERE "id" = $1`,
          backfillId,
        );
        repaired = rows[0]?.profile_number ?? null;
        throw new Rollback();
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    if (error instanceof Rollback) rolledBack = true;
    else throw error;
  }

  check(
    "the backfill gives a NULL row a number",
    typeof repaired === "number" && inRange(repaired),
    `profile_number=${repaired}`,
  );
  check("the check rolled its transaction back", rolledBack);
  check(
    "the simulated row is gone again",
    (await db.user.findUnique({ where: { id: backfillId } })) === null,
  );
  check(
    "and profile_number is still NOT NULL afterwards",
    (await columnState())[0]?.is_nullable === "NO",
  );

  console.log("\n# 7. cleanup\n");

  // Deleted by marker as well as by id, so a row left by an earlier crashed run is still found.
  // No real profile can carry the marker.
  const marked = await db.user.findMany({
    where: { privyId: { startsWith: MARKER } },
    select: { id: true },
  });
  await db.user.deleteMany({
    where: { id: { in: [...new Set([...created, ...marked.map((row) => row.id)])] } },
  });

  const leftover = await db.user.count({ where: { privyId: { startsWith: MARKER } } });
  check("the suite removed every row it created", leftover === 0, `${leftover} left behind`);

  const totalAfter = await realProfiles();
  check(
    "the real profile count is exactly what it was before",
    totalAfter === totalBefore,
    `${totalAfter} vs ${totalBefore}`,
  );

  console.log(`\n${pass} passed, ${fail} failed\n`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
