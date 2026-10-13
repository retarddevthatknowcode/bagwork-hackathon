/*
  Batch review: the operator's on/off switch, and the lock that keeps one run to one run.

  Both are rows rather than columns on something existing, because this is the first
  platform-level setting in the app and the next one will want the same shape. `value` is a
  small JSON object (`{"enabled":true}`) so a setting that needs more than a boolean does not
  need a migration; `locked_at` / `locked_by` are real columns because claiming the batch lock
  is a single conditional UPDATE, which a JSON field cannot express.
*/
-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
