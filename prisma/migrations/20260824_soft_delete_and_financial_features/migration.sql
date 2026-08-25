-- Add soft delete support to financial records

-- Add deletedAt to Payout
ALTER TABLE "Payout" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Add deletedAt to PayoutMethod (already exists in schema, ensuring it's there)
ALTER TABLE "PayoutMethod" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Create index for soft delete queries on Payout
CREATE INDEX "Payout_deletedAt_idx" ON "Payout"("deletedAt");

-- Create index for soft delete queries on PayoutMethod
CREATE INDEX "PayoutMethod_deletedAt_idx" ON "PayoutMethod"("deletedAt");

-- Add index for normal queries filtering deleted records
CREATE INDEX "Payout_userId_deletedAt_idx" ON "Payout"("userId", "deletedAt");

-- Add index for normal queries filtering deleted records on PayoutMethod
CREATE INDEX "PayoutMethod_userId_deletedAt_idx" ON "PayoutMethod"("userId", "deletedAt");

-- Add feeType to PayoutFeeConfig if not exists
ALTER TABLE "PayoutFeeConfig" ADD COLUMN IF NOT EXISTS "feeType" VARCHAR(50) DEFAULT 'fixed';

-- Create Clip Royalty model
CREATE TABLE IF NOT EXISTS "ClipRoyalty" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "clipId" INTEGER NOT NULL UNIQUE,
  "recipientAddress" VARCHAR(255) NOT NULL,
  "basisPoints" INTEGER NOT NULL,
  "platformFeeBps" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE
);

CREATE INDEX "ClipRoyalty_clipId_idx" ON "ClipRoyalty"("clipId");
CREATE INDEX "ClipRoyalty_recipientAddress_idx" ON "ClipRoyalty"("recipientAddress");
