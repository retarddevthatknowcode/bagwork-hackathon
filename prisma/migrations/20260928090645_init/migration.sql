-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "privy_id" TEXT,
    "wallet_address" TEXT,
    "handle" TEXT,
    "avatar_color" TEXT NOT NULL DEFAULT '#bdfe00',
    "trust_score" INTEGER NOT NULL DEFAULT 50,
    "total_earned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "approvals" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_symbol" TEXT NOT NULL,
    "token_color" TEXT NOT NULL DEFAULT '#bdfe00',
    "token_mint" TEXT NOT NULL,
    "treasury" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "rate_type" TEXT NOT NULL,
    "rate_per_1k" DOUBLE PRECISION NOT NULL,
    "max_payout" DOUBLE PRECISION NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "funded_amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holder_gate" BOOLEAN NOT NULL DEFAULT false,
    "holder_min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "geo" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "slots_remaining" INTEGER NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "user_id" TEXT,
    "post_url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "reposts" INTEGER NOT NULL DEFAULT 0,
    "quality_score" INTEGER NOT NULL DEFAULT 0,
    "authenticity_score" INTEGER NOT NULL DEFAULT 0,
    "payout_amount" DOUBLE PRECISION,
    "tx_signature" TEXT,
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "user_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "token" TEXT NOT NULL,
    "tx_signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "trust_score" INTEGER NOT NULL,
    "total_earned" DOUBLE PRECISION NOT NULL,
    "submissions" INTEGER NOT NULL,
    "approval_rate" INTEGER NOT NULL,
    "badge" TEXT,
    "rank" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_privy_id_key" ON "users"("privy_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "users_total_earned_idx" ON "users"("total_earned");

-- CreateIndex
CREATE INDEX "projects_token_symbol_idx" ON "projects"("token_symbol");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_ends_at_idx" ON "campaigns"("ends_at");

-- CreateIndex
CREATE INDEX "campaigns_project_id_idx" ON "campaigns"("project_id");

-- CreateIndex
CREATE INDEX "submissions_campaign_id_idx" ON "submissions"("campaign_id");

-- CreateIndex
CREATE INDEX "submissions_user_id_idx" ON "submissions"("user_id");

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_submission_id_key" ON "payouts"("submission_id");

-- CreateIndex
CREATE INDEX "payouts_created_at_idx" ON "payouts"("created_at");

-- CreateIndex
CREATE INDEX "payouts_user_id_idx" ON "payouts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboards_user_id_key" ON "leaderboards"("user_id");

-- CreateIndex
CREATE INDEX "leaderboards_rank_idx" ON "leaderboards"("rank");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboards" ADD CONSTRAINT "leaderboards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
