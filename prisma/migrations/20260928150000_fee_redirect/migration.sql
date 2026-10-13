-- Fee Redirect: a bag can be funded by its own token's trading fees.
ALTER TABLE "campaigns" ADD COLUMN "fee_redirect_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "fee_redirect_pct" DOUBLE PRECISION,
ADD COLUMN "fee_mint" TEXT,
ADD COLUMN "fee_raised_usdc" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Every token transfer into the Bagwork fee wallet, and what it converted to.
CREATE TABLE "fee_deposits" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "campaign_id" TEXT,
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL DEFAULT '',
    "decimals" INTEGER NOT NULL DEFAULT 9,
    "raw_amount" TEXT NOT NULL,
    "token_amount" DOUBLE PRECISION NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "usdc_amount" DOUBLE PRECISION,
    "swap_signature" TEXT,
    "swap_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "swapped_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_deposits_pkey" PRIMARY KEY ("id")
);

-- One row per on-chain transfer. This is what makes the sync job idempotent: re-polling the
-- same window can never double-credit a bag.
CREATE UNIQUE INDEX "fee_deposits_signature_key" ON "fee_deposits"("signature");
CREATE INDEX "fee_deposits_campaign_id_idx" ON "fee_deposits"("campaign_id");
CREATE INDEX "fee_deposits_mint_idx" ON "fee_deposits"("mint");
CREATE INDEX "fee_deposits_status_idx" ON "fee_deposits"("status");

ALTER TABLE "fee_deposits" ADD CONSTRAINT "fee_deposits_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
