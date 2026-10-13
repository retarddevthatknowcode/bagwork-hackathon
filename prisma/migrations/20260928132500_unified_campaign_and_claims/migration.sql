-- Add the treasury in three steps so existing campaigns keep a value instead of the
-- ALTER failing on "column contains null values".
ALTER TABLE "campaigns" ADD COLUMN "treasury" TEXT;

-- Existing bags were funded into their project's treasury; keep them pointing there so
-- their payout path is unchanged. New bags are pinned to Bagwork's treasury at creation.
UPDATE "campaigns" c SET "treasury" = p."treasury" FROM "projects" p WHERE c."project_id" = p."id";

-- Anything orphaned (shouldn't exist: project_id is NOT NULL with a cascading FK) gets the
-- zero address rather than blocking the migration.
UPDATE "campaigns" SET "treasury" = '11111111111111111111111111111111' WHERE "treasury" IS NULL;

ALTER TABLE "campaigns" ALTER COLUMN "treasury" SET NOT NULL;

-- AlterTable: the rest of the create-bag redesign.
ALTER TABLE "campaigns" ADD COLUMN     "banner_url" TEXT,
ADD COLUMN     "chain" TEXT NOT NULL DEFAULT 'solana',
ADD COLUMN     "funded_at" TIMESTAMP(3),
ADD COLUMN     "funding_signature" TEXT,
ADD COLUMN     "hybrid_bonus" DOUBLE PRECISION,
ADD COLUMN     "max_per_creator" INTEGER,
ADD COLUMN     "max_submissions" INTEGER,
ADD COLUMN     "payment_model" TEXT NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "token_decimals" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "token_kind" TEXT NOT NULL DEFAULT 'USDC',
ADD COLUMN     "token_logo_url" TEXT,
ADD COLUMN     "token_name" TEXT;

-- Backfill token metadata for the tokens that already exist.
UPDATE "projects" SET "token_kind" = 'USDC', "token_decimals" = 6, "token_name" = 'USD Coin'
WHERE "token_symbol" = 'USDC';
UPDATE "projects" SET "token_kind" = 'SOL', "token_decimals" = 9, "token_name" = 'Solana'
WHERE "token_symbol" = 'SOL';

-- AlterTable: a claim has no link yet, so post_url must become optional.
ALTER TABLE "submissions" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ALTER COLUMN "post_url" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "payout_wallet" TEXT;
