-- Issue #979: indexes for daily aggregation and reporting queries on Earning.
CREATE INDEX IF NOT EXISTS "Earning_date_idx" ON "Earning"("date");
CREATE INDEX IF NOT EXISTS "Earning_currency_idx" ON "Earning"("currency");
CREATE INDEX IF NOT EXISTS "Earning_date_currency_idx" ON "Earning"("date", "currency");
CREATE INDEX IF NOT EXISTS "Earning_deletedAt_idx" ON "Earning"("deletedAt");
CREATE INDEX IF NOT EXISTS "Earning_clipId_date_idx" ON "Earning"("clipId", "date");
