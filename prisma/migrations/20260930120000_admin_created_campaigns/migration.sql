-- Admin portal: operator-created campaigns + an edit trail for them.
--
-- `created_by_admin` is internal provenance only. It is never returned by the public campaign
-- APIs (`mapCampaign` builds that shape field by field), so creators cannot tell an
-- operator-created bag from a publisher-funded one.
--
-- Default false so every existing row — and every row created through the publisher flow —
-- stays correct without a backfill.

ALTER TABLE "campaigns"
    ADD COLUMN     "created_by_admin" BOOLEAN NOT NULL DEFAULT false;

-- One row per admin edit. No "who" column: the portal authenticates with a single shared
-- password, so there is no operator identity to record.
CREATE TABLE "campaign_admin_changes" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "action" TEXT NOT NULL DEFAULT 'UPDATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_admin_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campaign_admin_changes_campaign_id_idx" ON "campaign_admin_changes"("campaign_id");

ALTER TABLE "campaign_admin_changes"
    ADD CONSTRAINT "campaign_admin_changes_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
