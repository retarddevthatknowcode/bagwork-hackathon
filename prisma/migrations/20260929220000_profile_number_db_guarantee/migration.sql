-- Every user row must carry a permanent, unique 4-digit Bagworker number.
--
-- The bug this migration closes
-- ----------------------------
-- `profile_number` was added NOT NULL, but with **no default**. The application does allocate
-- a number (`freeProfileNumber` in src/lib/auth/session.ts), so this database looks fine — and
-- it is. The failure mode is any writer that does not know about the column:
--
--   * an older deployment still serving traffic while the migration had already landed here,
--   * a one-off script, a psql session, a Supabase SQL editor window,
--   * any future service that inserts a `users` row.
--
-- Every one of those gets a hard
--   `null value in column "profile_number" of relation "users" violates not-null constraint`
-- and takes Profile and Onboarding down with it, because `syncUser` is the first thing every
-- authenticated route calls. A constraint that is only satisfied by the *current* caller's
-- discipline is not a guarantee; the database has to own it.
--
-- What this does
-- --------------
--   1. `next_profile_number()`  — a free 4-digit number (random probes, then a scan).
--   2. backfill                 — every row that is still NULL gets one.
--   3. `SET NOT NULL` + unique index  — the constraint stays, and stays welded to uniqueness.
--   4. `BEFORE INSERT` trigger  — fills the column in whenever the writer left it out.
--
-- Callers that allocate explicitly (the app) are unaffected: the trigger only fills a NULL, so
-- the number the app chose is the number that is stored, and the app's existing P2002 retry
-- still covers the astronomically rare case of two concurrent inserts picking the same number.
--
-- Idempotent: safe to re-run, and safe on a database where any part already exists. Prisma
-- does not manage functions or triggers, so this introduces no schema drift.
--
-- The range and the two-phase strategy deliberately mirror `randomBagworkerNumber` and
-- `freeProfileNumber` in src/lib/profile/points.ts / src/lib/auth/session.ts. Keep them in step.

/* ------------------------------------------------------------------ 1. the allocator */

CREATE OR REPLACE FUNCTION public.next_profile_number() RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  candidate integer;
  attempt   integer := 0;
BEGIN
  -- Random first, exactly like the application: a low number would advertise how early
  -- someone arrived, so numbers are not handed out in order.
  WHILE attempt < 10 LOOP
    candidate := 1000 + floor(random() * 9000)::integer;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE profile_number = candidate) THEN
      RETURN candidate;
    END IF;
    attempt := attempt + 1;
  END LOOP;

  -- Ten probes all collided, so the space is close to full: scan it once instead of
  -- guessing forever. At most 9,000 rows, and only on this rare path.
  SELECT series INTO candidate
  FROM generate_series(1000, 9999) AS series
  WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.profile_number = series)
  ORDER BY series
  LIMIT 1;

  IF candidate IS NULL THEN
    RAISE EXCEPTION 'Every Bagworker number (1000-9999) is taken — widen the range in lib/profile/points.ts';
  END IF;

  RETURN candidate;
END $$;

/* ------------------------------------------------------------------ 2. backfill */

-- Any row that predates the number. This database has none, but the statement is what makes
-- the requirement true everywhere rather than only where it was checked by hand — and it is a
-- no-op cost of one index scan when there is nothing to fix.
--
-- The function is called per row, and each row it assigns is visible to the next call inside
-- this transaction, so the backfill cannot hand the same number to two rows.
UPDATE public.users
SET profile_number = public.next_profile_number()
WHERE profile_number IS NULL;

/* ------------------------------------------------------------------ 3. the constraint */

ALTER TABLE public.users ALTER COLUMN profile_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_profile_number_key" ON public.users(profile_number);

/* ------------------------------------------------------------------ 4. the safety net */

CREATE OR REPLACE FUNCTION public.assign_profile_number() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only ever a null fill. An explicitly supplied number is left exactly as it is, which is
  -- what keeps this invisible to the application's own allocation path.
  IF NEW.profile_number IS NULL THEN
    NEW.profile_number := public.next_profile_number();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_assign_profile_number ON public.users;
CREATE TRIGGER users_assign_profile_number
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_profile_number();

/* ------------------------------------------------------------------ privileges */

-- The trigger runs as whoever inserts, so every role that is allowed to write a `users` row
-- needs EXECUTE. `postgres` owns the table and keeps it implicitly; `service_role` has full
-- table privileges from rls.sql. `anon`/`authenticated` have no INSERT policy, so granting
-- them EXECUTE costs nothing — the SELECT inside is RLS-protected and returns no rows for
-- them, which is why this is a grant and not a revoke.
GRANT EXECUTE ON FUNCTION public.next_profile_number() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_profile_number() TO PUBLIC;

NOTIFY pgrst, 'reload schema';
