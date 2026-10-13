-- Anti-fraud audit trail: which verified account a link was proven to come from.
ALTER TABLE "submissions" ADD COLUMN "verified_handle" TEXT,
ADD COLUMN "verified_platform" TEXT;

-- One post URL may exist once on the whole platform. Enforced in the database, not only in the
-- route, because the route check is a race: two concurrent submissions of the same link would
-- both pass it. NULLs are unaffected — a claimed slot has no link yet, and Postgres allows many
-- NULLs in a unique index.
CREATE UNIQUE INDEX "submissions_post_url_key" ON "submissions"("post_url");
