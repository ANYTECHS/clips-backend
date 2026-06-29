-- Add soft delete support to Earning model
ALTER TABLE "Earning"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
