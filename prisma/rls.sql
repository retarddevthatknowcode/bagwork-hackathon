-- BAGWORK — Postgres privileges and Row Level Security.
--
-- Run once after the Prisma migration (see the tool-results/run-migration helper):
--   node node_modules/prisma/build/index.js db execute --file prisma/rls.sql --schema prisma/schema.prisma
--
-- Why this is needed
-- ------------------
-- Prisma creates the tables as the `postgres` role, so Supabase's `anon`,
-- `authenticated` and `service_role` roles start with no privileges and PostgREST
-- cannot see them at all (every request 404s).
--
-- The security model after this script:
--
--   * Server code  -> Prisma connects as the table OWNER, which bypasses RLS.
--                     All writes, moderation and payouts happen here.
--   * Browser code -> supabase-js with the publishable key, subject to RLS. Only the
--                     two public-read policies below grant anything; every other table
--                     (users, submissions, payouts, leaderboards) stays server-only.
--
-- Keep the two layers in sync: if you add a table, enable RLS on it and add a policy
-- only if the browser genuinely needs to read it.

-- 1) Base privileges so PostgREST can expose the Prisma-created tables.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- 2) Row Level Security: deny by default for every client.
ALTER TABLE public.campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;

-- 3) The only public reads: live campaigns, and the projects funding them.
DROP POLICY IF EXISTS "live campaigns are public" ON public.campaigns;
CREATE POLICY "live campaigns are public" ON public.campaigns
  FOR SELECT TO anon, authenticated
  USING (status = 'LIVE');

DROP POLICY IF EXISTS "projects behind live campaigns are public" ON public.projects;
CREATE POLICY "projects behind live campaigns are public" ON public.projects
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.project_id = projects.id AND c.status = 'LIVE'
    )
  );

-- 4) No policy is defined for users / submissions / payouts / leaderboards, so RLS
--    denies all client access to them. Add one here if a screen ever needs it, e.g.:
--      CREATE POLICY "leaderboard is public" ON public.leaderboards
--        FOR SELECT TO anon, authenticated USING (true);

-- 5) Tell PostgREST to pick up the new tables immediately.
NOTIFY pgrst, 'reload schema';
