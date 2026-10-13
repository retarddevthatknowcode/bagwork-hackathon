/*
  Flywheel fee isolation: a per-campaign budget guard, and the currency a bag pays in.

  `paid_out` is a running total of what a bag has settled *or reserved* for payouts. It exists so
  the budget check can be one atomic conditional UPDATE — `budget - paid_out >= amount` — because
  Prisma cannot compare two columns in a `where` clause, and a read-then-write check lets two
  concurrent payouts for the same bag both pass. The backfill starts it at each bag's real settled
  total, so it is consistent the moment the guard is switched on.

  `payout_mint` records the mint a bag's creators are actually paid in when that differs from the
  project's token. A launched flywheel bag's Project keeps the coin's identity for display, but its
  budget is USDC (the fee loop swaps into USDC before crediting), so its payouts must be USDC.
  Null means "pay in project.tokenMint" — unchanged behaviour for every existing bag.

  Written to match `prisma/schema.prisma` exactly, so a later `prisma migrate dev` sees no drift.
*/
-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "paid_out" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "payout_mint" TEXT;

-- Backfill: every bag starts with `paid_out` equal to what it has already really paid out, so the
-- guard is correct from its first invocation rather than only for bags paid after this migration.
UPDATE "campaigns" c
   SET "paid_out" = COALESCE(
     (
       SELECT SUM(s."payout_amount")
         FROM "submissions" s
        WHERE s."campaign_id" = c."id"
          AND s."status" = 'paid'
     ),
     0
   );
