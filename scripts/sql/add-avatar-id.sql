-- Additive migration: pixel avatars.
--
-- Applied with `prisma db execute` rather than `prisma db push`, on purpose:
-- `db push` also wanted to DROP "submissions_post_url_key", which is pre-existing schema
-- drift unrelated to this change. Dropping a unique index on a post URL is a real
-- behaviour change, so it is deliberately left alone here.
--
-- This file used to also create a `payout_wallets` table. That system was removed (see
-- `drop-payout-wallets.sql`) — Bagwork holds no keys.
--
-- Idempotent, so re-running is safe.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_id" TEXT;
