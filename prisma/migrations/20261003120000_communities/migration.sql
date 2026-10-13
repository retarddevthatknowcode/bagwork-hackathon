-- Communities: one announcement board per bag.
--
-- Three tables, all additive — nothing existing is altered, so this migration cannot affect a
-- bag, a submission, a payout or a profile:
--
--   1. `communities`        — one row per bag, enforced by the unique index on `campaign_id`.
--   2. `community_members`  — who can open it, and in what role. The publisher is ADMIN; everyone
--                             else who joined the bag is MEMBER.
--   3. `community_messages` — the announcements themselves.
--
-- Access is never decided by these tables alone: `lib/community/access.ts` also accepts anyone
-- holding a submission on the campaign, so a membership row that has not been written yet (a
-- claim made before the community existed) cannot lock a real member out. The rows are what make
-- roles and the member count possible, not what grants entry.

-- ---- 1. The community itself ------------------------------------------------------------

CREATE TABLE "communities" (
  "id"                 TEXT         NOT NULL,
  "campaign_id"        TEXT         NOT NULL,
  "created_by_user_id" TEXT,
  "title"              TEXT         NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- One community per bag. Also what lets a campaign id address its community directly.
CREATE UNIQUE INDEX "communities_campaign_id_key" ON "communities"("campaign_id");

-- ---- 2. Membership ---------------------------------------------------------------------

CREATE TABLE "community_members" (
  "id"           TEXT         NOT NULL,
  "community_id" TEXT         NOT NULL,
  "user_id"      TEXT         NOT NULL,
  "role"         TEXT         NOT NULL DEFAULT 'MEMBER',
  "joined_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "community_members_community_id_user_id_key" ON "community_members"("community_id", "user_id");
CREATE INDEX "community_members_user_id_idx" ON "community_members"("user_id");

-- ---- 3. Announcements ------------------------------------------------------------------

CREATE TABLE "community_messages" (
  "id"           TEXT         NOT NULL,
  "community_id" TEXT         NOT NULL,
  "sender_id"    TEXT,
  "body"         TEXT         NOT NULL,
  "image_url"    TEXT,
  "link_url"     TEXT,
  "is_pinned"    BOOLEAN      NOT NULL DEFAULT false,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "community_messages_pkey" PRIMARY KEY ("id")
);

-- The feed reads newest-first inside one community; the pinned block reads the same way.
CREATE INDEX "community_messages_community_id_created_at_idx" ON "community_messages"("community_id", "created_at");
CREATE INDEX "community_messages_community_id_is_pinned_idx" ON "community_messages"("community_id", "is_pinned");

-- ---- Foreign keys ---------------------------------------------------------------------

-- A deleted bag takes its community, its membership and its announcements with it: a board
-- attached to nothing has no members left to read it.
ALTER TABLE "communities" ADD CONSTRAINT "communities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: the community and its history outlive the account that opened it,
-- and admin access still derives from `campaigns.created_by`.
ALTER TABLE "communities" ADD CONSTRAINT "communities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- An announcement stays readable after its author is removed.
ALTER TABLE "community_messages" ADD CONSTRAINT "community_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
