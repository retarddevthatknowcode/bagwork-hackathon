-- Alchemy integration, features 1-5.
--
-- Two changes:
--   1. `payouts.confirmed_at` — payouts are now only written after the transfer has been confirmed
--      on-chain (RPC check for success, recipient, amount and mint), so this records when that
--      verification happened. Nullable: rows written before this step existed have no verified time.
--   2. `treasury_inbound_events` — the raw ledger of every transfer the treasury has seen, as
--      reported by the Alchemy address-activity webhook or read back from the RPC. Written before
--      any matching, so a deposit that no bag wants (or that the parser does not yet understand)
--      still leaves a trace.

ALTER TABLE "payouts" ADD COLUMN "confirmed_at" TIMESTAMP(3);

-- Every transfer in or out of the Bagwork treasury, and what it turned out to be.
CREATE TABLE "treasury_inbound_events" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "transfer_index" INTEGER NOT NULL DEFAULT 0,
    "direction" TEXT NOT NULL DEFAULT 'in',
    "asset_type" TEXT NOT NULL DEFAULT 'spl',
    "mint" TEXT NOT NULL DEFAULT '',
    "symbol" TEXT NOT NULL DEFAULT '',
    "decimals" INTEGER NOT NULL DEFAULT 9,
    "raw_amount" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "watch_address" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'unmatched',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "campaign_id" TEXT,
    "fee_deposit_id" TEXT,
    "note" TEXT DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'webhook',
    "block_time" TIMESTAMP(3),
    "raw" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_inbound_events_pkey" PRIMARY KEY ("id")
);

-- The idempotency guarantee: a replayed webhook carrying the same transfer cannot insert twice.
CREATE UNIQUE INDEX "treasury_inbound_events_event_key_key" ON "treasury_inbound_events"("event_key");
CREATE INDEX "treasury_inbound_events_signature_idx" ON "treasury_inbound_events"("signature");
CREATE INDEX "treasury_inbound_events_mint_idx" ON "treasury_inbound_events"("mint");
CREATE INDEX "treasury_inbound_events_kind_idx" ON "treasury_inbound_events"("kind");
CREATE INDEX "treasury_inbound_events_status_idx" ON "treasury_inbound_events"("status");
CREATE INDEX "treasury_inbound_events_created_at_idx" ON "treasury_inbound_events"("created_at");

-- Both links are SET NULL rather than CASCADE: the ledger is the record that money moved, so it
-- must outlive the bag or the swap-queue row it was attached to.
ALTER TABLE "treasury_inbound_events" ADD CONSTRAINT "treasury_inbound_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "treasury_inbound_events" ADD CONSTRAINT "treasury_inbound_events_fee_deposit_id_fkey" FOREIGN KEY ("fee_deposit_id") REFERENCES "fee_deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
