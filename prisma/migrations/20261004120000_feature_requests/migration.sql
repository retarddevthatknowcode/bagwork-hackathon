-- Feature requests: the public upvote board.
--
-- Two tables, both additive — nothing existing is altered, so this migration cannot affect a
-- bag, a submission, a payout, a profile, a community or a score:
--
--   1. `feature_requests` — the ideas themselves, carrying the tally that orders the board.
--   2. `feature_votes`    — one row per account per idea. The unique index on
--                           (request_id, user_id) IS the one-vote-per-user rule; it is enforced
--                           by the database so no route can forget to check it.
--
-- `upvotes` is a denormalised count of the vote rows, and it exists for one reason: it is the
-- sort key for the whole board, so ordering by a subquery count would mean aggregating every
-- vote on every read. It is written in the same transaction as the vote, which is what keeps
-- the two from drifting.
--
-- Deleting an account is deliberately asymmetric: the request survives (other people voted on
-- it, and the text is theirs to keep reading) but the vote does not, because a vote is a
-- statement by one account and cannot outlive it. That is `SET NULL` on the author and
-- `CASCADE` on the vote.

-- ---- 1. The ideas ------------------------------------------------------------------------

CREATE TABLE "feature_requests" (
  "id"         TEXT         NOT NULL,
  "author_id"  TEXT,
  "title"      TEXT         NOT NULL,
  "details"    TEXT         NOT NULL,
  "upvotes"    INTEGER      NOT NULL DEFAULT 0,
  "status"     TEXT         NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id")
);

-- The board's default read is "most upvoted first", and the newest sort is the fallback.
CREATE INDEX "feature_requests_upvotes_idx" ON "feature_requests"("upvotes");
CREATE INDEX "feature_requests_created_at_idx" ON "feature_requests"("created_at");
-- Status is used for filtering (Open / Planned / Done).
CREATE INDEX "feature_requests_status_idx" ON "feature_requests"("status");

-- ---- 2. The votes ------------------------------------------------------------------------

CREATE TABLE "feature_votes" (
  "id"         TEXT         NOT NULL,
  "request_id" TEXT         NOT NULL,
  "user_id"    TEXT         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_votes_pkey" PRIMARY KEY ("id")
);

-- One account, one vote, per request. The whole anti-spam rule, and the reason `upvotes`
-- cannot be inflated by a client that simply posts twice.
CREATE UNIQUE INDEX "feature_votes_request_id_user_id_key" ON "feature_votes"("request_id", "user_id");

-- "Which of these have I already voted on" is asked once per board read, for one account.
CREATE INDEX "feature_votes_user_id_idx" ON "feature_votes"("user_id");

-- ---- Foreign keys ------------------------------------------------------------------------

-- SET NULL: the request and its votes outlive the account that filed it.
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CASCADE: a vote is only meaningful as part of its request's tally.
ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "feature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE: a vote belongs to the account that cast it, so it goes when that account does.
ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
