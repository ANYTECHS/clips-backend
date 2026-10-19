-- Indexes to speed soft-delete filters and aggregations on earnings
CREATE INDEX IF NOT EXISTS "Earning_clipId_idx" ON "Earning"("clipId");
CREATE INDEX IF NOT EXISTS "Earning_deletedAt_idx" ON "Earning"("deletedAt");
CREATE INDEX IF NOT EXISTS "Earning_date_idx" ON "Earning"("date");
