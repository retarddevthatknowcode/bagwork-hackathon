/*
  Fee transparency: the quote we already have when a deposit is too small to swap.

  `swapAndCredit` quotes every deposit and then declines to send anything under the floor, so the USD
  value was known and thrown away — the panel could only say "some tokens are waiting", not "$12.40 is
  waiting". Storing the quote makes the waiting figure real. Nullable, and null for a deposit with no
  route at all, so "unknown" stays distinguishable from "worth nothing".

  Additive and nullable, so no existing row changes meaning.
*/
-- AlterTable
ALTER TABLE "fee_deposits" ADD COLUMN "estimated_usdc" DOUBLE PRECISION;
