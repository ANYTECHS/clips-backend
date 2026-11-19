-- Task 1: royalty BPS default 1000 (10%)
-- Task 4: ensure mint tracking columns exist

ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "royaltyBps" INTEGER;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "metadataUri" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "mintAddress" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "mintedAt" TIMESTAMP(3);
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "nftStatus" TEXT NOT NULL DEFAULT 'none';

ALTER TABLE "Clip" ALTER COLUMN "royaltyBps" SET DEFAULT 1000;

-- Backfill null royalties to the platform default (1000 BPS = 10%)
UPDATE "Clip" SET "royaltyBps" = 1000 WHERE "royaltyBps" IS NULL;

-- Unique mint address when present
CREATE UNIQUE INDEX IF NOT EXISTS "Clip_mintAddress_key" ON "Clip"("mintAddress");
