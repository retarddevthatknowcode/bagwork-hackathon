-- The wallet a funding transfer was built from, so verification can require that exact signer.
ALTER TABLE "campaigns" ADD COLUMN "funding_wallet" TEXT;
