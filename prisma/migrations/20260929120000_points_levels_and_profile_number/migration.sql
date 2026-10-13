-- Points, level, the permanent Bagworker# number, and the pixel character.
--
-- Three things land here:
--   1. `points` / `level` — the progression system (`src/lib/profile/points.ts`).
--   2. `profile_number` — the unique random 4-digit identity shown as Bagworker#3578.
--   3. `character`      — the onboarding character builder choice set.
--
-- The three numeric columns are NOT NULL with defaults, so this is additive and safe on a
-- live table. `profile_number` is the one that needs care: it is unique and random, so it
-- is added nullable, backfilled, and only then constrained.

ALTER TABLE "users" ADD COLUMN "points" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN "character" JSONB;
ALTER TABLE "users" ADD COLUMN "profile_number" INTEGER;

-- Backfill points from the payouts that actually settled, not from `total_earned`.
-- Payouts are the primary record that money moved, and `pointsForEarnings` floors each
-- payout independently, so this mirrors exactly what `creditPayoutRewards` awards from
-- here on ($1 = 33 points). Historical rows that were credited by an older, looser flow
-- therefore cannot inflate a profile's points.
UPDATE "users" u
SET
  "points" = settled.pts,
  "level" = CASE
    -- Mirrors LEVEL_THRESHOLDS in src/lib/profile/points.ts (0 / 5k / 25k / 75k / 200k).
    WHEN settled.pts >= 200000 THEN 5
    WHEN settled.pts >= 75000 THEN 4
    WHEN settled.pts >= 25000 THEN 3
    WHEN settled.pts >= 5000 THEN 2
    ELSE 1
  END
FROM (
  SELECT "user_id", SUM(FLOOR("amount" * 33))::INTEGER AS pts
  FROM "payouts"
  WHERE "user_id" IS NOT NULL
  GROUP BY "user_id"
) AS settled
WHERE settled."user_id" = u."id";

-- Existing accounts get a random 4-digit number too. The loop picks a candidate and only
-- commits it if it is still free, so the numbers stay unique even though they are random.
DO $$
DECLARE
  target  TEXT;
  candidate INTEGER;
BEGIN
  FOR target IN SELECT "id" FROM "users" WHERE "profile_number" IS NULL LOOP
    LOOP
      candidate := 1000 + FLOOR(RANDOM() * 9000)::INTEGER;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "users" WHERE "profile_number" = candidate);
    END LOOP;
    UPDATE "users" SET "profile_number" = candidate WHERE "id" = target;
  END LOOP;
END $$;

ALTER TABLE "users" ALTER COLUMN "profile_number" SET NOT NULL;
CREATE UNIQUE INDEX "users_profile_number_key" ON "users"("profile_number");
CREATE INDEX "users_points_idx" ON "users"("points");
