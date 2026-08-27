-- Issue #767: daily earnings aggregation.
-- Adds the DailyEarning roll-up table (one row per user / UTC day / currency)
-- and the denormalised UserEarningsSummary refreshed by the same nightly job.

-- CreateTable
CREATE TABLE IF NOT EXISTS "DailyEarning" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalInBaseCurrency" DOUBLE PRECISION,
  "earningCount" INTEGER NOT NULL DEFAULT 0,
  "clipCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DailyEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserEarningsSummary" (
  "userId" INTEGER NOT NULL,
  "totalEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalPaidOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "availableBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "lastAggregatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserEarningsSummary_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DailyEarning_userId_date_currency_key"
  ON "DailyEarning"("userId", "date", "currency");
CREATE INDEX IF NOT EXISTS "DailyEarning_userId_idx" ON "DailyEarning"("userId");
CREATE INDEX IF NOT EXISTS "DailyEarning_date_idx" ON "DailyEarning"("date");
CREATE INDEX IF NOT EXISTS "DailyEarning_userId_date_idx" ON "DailyEarning"("userId", "date");

-- AddForeignKey
ALTER TABLE "DailyEarning"
  DROP CONSTRAINT IF EXISTS "DailyEarning_userId_fkey";
ALTER TABLE "DailyEarning"
  ADD CONSTRAINT "DailyEarning_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserEarningsSummary"
  DROP CONSTRAINT IF EXISTS "UserEarningsSummary_userId_fkey";
ALTER TABLE "UserEarningsSummary"
  ADD CONSTRAINT "UserEarningsSummary_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
