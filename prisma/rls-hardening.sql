-- BAGWORK — RLS hardening pass.
--
-- Audited 2026-09-28 against the live database. `prisma/rls.sql` had already enabled
-- Row Level Security on all six app tables and defined exactly two public-read policies
-- (live campaigns, and the projects funding them), so users / submissions / payouts /
-- leaderboards deny every client request. Two things were still wrong:
--
--   1. `_prisma_migrations` had SELECT granted to `anon` and `authenticated` with RLS
--      disabled, so the whole migration history (table names, timestamps, checksums) was
--      readable by anyone with the publishable key.
--
--   2. `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES TO anon, authenticated` in
--      rls.sql means *every table created in future* is automatically readable by anon.
--      RLS still denies the rows today, but the safety net disappears the moment a table
--      is created without RLS enabled. Grants should be explicit per public table.
--
-- Run:
--   node node_modules/prisma/build/index.js db execute --file prisma/rls-hardening.sql --schema prisma/schema.prisma
--
-- This does NOT touch the campaigns/projects grants: those back the documented
-- browser-read path (`src/lib/supabase/client.ts`). Revoking them would break it.

-- 1) Migration history is not public.
REVOKE ALL ON TABLE public._prisma_migrations FROM anon, authenticated;

-- 2) No more automatic grants to unauthenticated roles for new tables. The two public
--    tables keep the grants they already have; add new ones deliberately, next to the
--    policy that justifies them:
--      GRANT SELECT ON public.<table> TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon, authenticated;

-- 3) Make the intent explicit for the tables that are already granted, so a future
--    `REVOKE ... ON ALL TABLES` does not silently take them away.
GRANT SELECT ON TABLE public.campaigns TO anon, authenticated;
GRANT SELECT ON TABLE public.projects TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
