-- `hybrid_bonus` was the wrong name for this column: it holds the *flat* component of a
-- HYBRID payout, which is a base fee, not a bonus. Renamed before anything reads it.
ALTER TABLE "campaigns" RENAME COLUMN "hybrid_bonus" TO "fixed_fee";
