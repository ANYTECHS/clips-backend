-- Add approvedBy and reviewedAt fields to Payout model for approval workflow (#776)

ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER;
ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
