-- AlterTable: add metadata JSON field to Video (issue #388)
ALTER TABLE "Video" ADD COLUMN "metadata" JSONB;

-- AlterTable: add externalTransactionId to Payout (issue #395)
ALTER TABLE "Payout" ADD COLUMN "externalTransactionId" TEXT;
