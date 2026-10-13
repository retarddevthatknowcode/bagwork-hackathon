-- Removes the custodial payout wallet store.
--
-- Bagwork no longer mints or holds keys. Creators set their own address on
-- `users.payout_wallet` and that column is untouched here, so existing payout destinations
-- keep working — only the platform's copy of the secrets goes away. Dropping the table
-- deletes the ciphertext with it, which is the point.
--
-- Safe to re-run.

DROP TABLE IF EXISTS "payout_wallets";
