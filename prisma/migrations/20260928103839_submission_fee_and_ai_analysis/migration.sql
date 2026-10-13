-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "ai_analysis" JSONB,
ADD COLUMN     "fee_amount" DOUBLE PRECISION;
