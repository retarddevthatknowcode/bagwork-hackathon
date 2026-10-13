-- AlterTable
ALTER TABLE "users" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "interests" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "last_seen_at" TIMESTAMP(3),
ADD COLUMN     "onboarding_completed_at" TIMESTAMP(3),
ADD COLUMN     "socials" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "user_type" TEXT;
