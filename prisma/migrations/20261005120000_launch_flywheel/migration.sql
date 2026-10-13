/*
  Launch-on-Bagwork: the Launch Wizard's own records, plus the two campaign columns a launched
  bag needs.

  Three things happen here, all additive:

  1. `campaigns.kind` names which product a bag is (FIXED | FLYWHEEL). It is persisted rather
     than derived, because the derivation only ever held while there was exactly one way to
     create a Fee Redirect bag. The backfill repeats that old derivation verbatim
     (`fee_redirect_enabled = true` → FLYWHEEL) so no existing row changes meaning.

  2. `campaigns.token_image_url` / `token_symbol` carry a launched coin's artwork and ticker.
     Nullable, and null for every fixed-budget bag, so nothing existing is affected.

  3. `launches` records the on-chain launch itself — separate from the campaign it produces,
     so a launch that fails verification still leaves a diagnosable row behind.
*/
-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FIXED';
ALTER TABLE "campaigns" ADD COLUMN "token_image_url" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "token_symbol" TEXT;

-- Backfill: a bag created with Fee Redirect on is a flywheel. Same rule the previous code applied
-- at read time, now written down so the data and the code agree.
UPDATE "campaigns" SET "kind" = 'FLYWHEEL' WHERE "fee_redirect_enabled" = true;

-- CreateIndex
CREATE INDEX "campaigns_kind_idx" ON "campaigns"("kind");

-- CreateTable
CREATE TABLE "launches" (
    "id" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "image_url" TEXT,
    "description" TEXT NOT NULL,
    "metadata_uri" TEXT,
    "launcher_user_id" TEXT,
    "launcher_wallet" TEXT NOT NULL,
    "signature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "dev_buy_lamports" BIGINT NOT NULL DEFAULT 0,
    "dev_buy_bps" INTEGER NOT NULL DEFAULT 0,
    "treasury" TEXT NOT NULL,
    "fee_share_bps" INTEGER NOT NULL DEFAULT 0,
    "admin_revoked" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "bag_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "launches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "launches_mint_key" ON "launches"("mint");

-- CreateIndex
CREATE UNIQUE INDEX "launches_signature_key" ON "launches"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "launches_bag_id_key" ON "launches"("bag_id");

-- CreateIndex
CREATE INDEX "launches_status_idx" ON "launches"("status");

-- CreateIndex
CREATE INDEX "launches_launcher_user_id_idx" ON "launches"("launcher_user_id");

-- AddForeignKey
ALTER TABLE "launches" ADD CONSTRAINT "launches_launcher_user_id_fkey" FOREIGN KEY ("launcher_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "launches" ADD CONSTRAINT "launches_bag_id_fkey" FOREIGN KEY ("bag_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
