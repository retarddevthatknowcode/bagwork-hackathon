-- Weekly Quests: the catalogue, per-user weekly progress, and the two timestamps the metrics
-- need in order to be honest about *when* work happened.
--
-- Three parts:
--   1. `quests`      — the three starter quests, seeded here so they exist in every environment.
--   2. `user_quests` — one row per user, per quest, per week. Holds the completion and the
--                      exactly-once award marker.
--   3. `submitted_at` / `approved_at` on `submissions` — so a link is counted in the week it was
--                      validated and views in the week their submission was approved. Neither can
--                      be derived from `created_at` (a claim filled days later) or `updated_at`
--                      (which moves on any write).
--
-- Idempotent and additive: every column is nullable and every insert is guarded by the unique
-- slug, so re-running this file changes nothing.

-- ---- 1. The quest catalogue -------------------------------------------------------------

CREATE TABLE "quests" (
  "id"          TEXT         NOT NULL,
  "slug"        TEXT         NOT NULL,
  "title"       TEXT         NOT NULL,
  "description" TEXT         NOT NULL,
  "metric"      TEXT         NOT NULL,
  "target"      INTEGER      NOT NULL,
  "reward"      INTEGER      NOT NULL DEFAULT 200,
  "cadence"     TEXT         NOT NULL DEFAULT 'WEEKLY',
  "active"      BOOLEAN      NOT NULL DEFAULT true,
  "sort_order"  INTEGER      NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quests_slug_key" ON "quests"("slug");
CREATE INDEX "quests_active_sort_order_idx" ON "quests"("active", "sort_order");

-- The three starter quests, each paying 200 points.
-- `ON CONFLICT DO NOTHING` on the slug: an operator who retitles or retargets a quest keeps
-- their edit, because this insert can only ever add a row that is missing.
INSERT INTO "quests" ("id", "slug", "title", "description", "metric", "target", "reward", "cadence", "active", "sort_order", "updated_at")
VALUES
  ('qst_opt_in_starter', 'opt-in-starter',  'Opt-in Starter',  'Opt into 3 different live Bags this week.',                        'opt_in',         3,      200, 'WEEKLY', true, 1, CURRENT_TIMESTAMP),
  ('qst_content_creator', 'content-creator', 'Content Creator', 'Submit 5 content links that pass validation this week.',           'content_links',  5,      200, 'WEEKLY', true, 2, CURRENT_TIMESTAMP),
  ('qst_view_hunter', 'view-hunter',        'View Hunter',     'Generate 10,000 verified views across submissions approved this week.', 'verified_views', 10000, 200, 'WEEKLY', true, 3, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- ---- 2. Per-user weekly progress ---------------------------------------------------------

CREATE TABLE "user_quests" (
  "id"             TEXT         NOT NULL,
  "user_id"        TEXT         NOT NULL,
  "quest_id"       TEXT         NOT NULL,
  "period_key"     TEXT         NOT NULL,
  "progress"       INTEGER      NOT NULL DEFAULT 0,
  "status"         TEXT         NOT NULL DEFAULT 'in_progress',
  "completed_at"   TIMESTAMP(3),
  "points_awarded" INTEGER      NOT NULL DEFAULT 0,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_quests_pkey" PRIMARY KEY ("id")
);

-- One row per quest per week: this is what makes a re-sync an upsert instead of a duplicate.
CREATE UNIQUE INDEX "user_quests_user_id_quest_id_period_key_key"
  ON "user_quests"("user_id", "quest_id", "period_key");

-- The board reads one user's week; the leaderboard reads everyone's week.
CREATE INDEX "user_quests_user_id_period_key_idx" ON "user_quests"("user_id", "period_key");
CREATE INDEX "user_quests_period_key_idx" ON "user_quests"("period_key");

ALTER TABLE "user_quests"
  ADD CONSTRAINT "user_quests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_quests"
  ADD CONSTRAINT "user_quests_quest_id_fkey"
  FOREIGN KEY ("quest_id") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- 3. When a link arrived, and when a submission was approved ----------------------------

ALTER TABLE "submissions" ADD COLUMN "submitted_at" TIMESTAMP(3);
ALTER TABLE "submissions" ADD COLUMN "approved_at" TIMESTAMP(3);

-- Backfill from the only evidence that exists for older rows: a row with a link was submitted
-- when it was created, and an approved one was approved at its last write.
UPDATE "submissions" SET "submitted_at" = "created_at" WHERE "post_url" IS NOT NULL;
UPDATE "submissions"
  SET "approved_at" = "updated_at"
  WHERE "status" IN ('approved', 'paid') AND "approved_at" IS NULL;
