-- AlterTable: Add multi-currency fields to Earning model
ALTER TABLE "Earning"
  ADD COLUMN IF NOT EXISTS "amountInBaseCurrency" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "exchangeRate" DOUBLE PRECISION;
