/*
  Two treasuries, one per funding model.

  Campaigns now record which Bagwork wallet custodies their budget (`treasury_kind`):
  FIXED for publisher-funded bags, FEE for Fee Redirect flywheels. The column defaults to
  FIXED so every pre-existing row lands somewhere sane, and the backfill below stamps the
  fee-redirect bags as FEE — the same rule `treasuryKindFor` applies at runtime, written
  down so the data agrees with the code.
*/
-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "treasury_kind" TEXT NOT NULL DEFAULT 'FIXED';

-- Backfill: an existing fee-redirect bag belongs to the FEE treasury.
UPDATE "campaigns" SET "treasury_kind" = 'FEE' WHERE "fee_redirect_enabled" = true;
