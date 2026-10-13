-- Banner artwork uploaded through the bag form.
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "mime_type" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "uploads_user_id_idx" ON "uploads"("user_id");
