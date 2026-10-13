/*
  Bug reports and ops events.

  One table for both a user-filed bug and a failure the platform noticed, distinguished by
  `source`. `meta` is JSONB so a new kind of context (a status code today, something else
  tomorrow) needs no migration. `user_id` is ON DELETE SET NULL: the history belongs to the
  platform, not to the account that happened to file it.

  Written to match `prisma/schema.prisma` exactly, so a later `prisma migrate dev` sees no drift.
*/
-- CreateTable
CREATE TABLE "ops_reports" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "category" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "path" TEXT,
    "user_id" TEXT,
    "user_agent" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "admin_note" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ops_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ops_reports_created_at_idx" ON "ops_reports"("created_at");

-- CreateIndex
CREATE INDEX "ops_reports_status_created_at_idx" ON "ops_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "ops_reports_source_idx" ON "ops_reports"("source");

-- CreateIndex
CREATE INDEX "ops_reports_category_idx" ON "ops_reports"("category");

-- CreateIndex
CREATE INDEX "ops_reports_user_id_idx" ON "ops_reports"("user_id");

-- AddForeignKey
ALTER TABLE "ops_reports" ADD CONSTRAINT "ops_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
