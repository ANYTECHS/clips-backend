-- A month summary is unique per user, period, and currency.
DROP INDEX IF EXISTS "MonthlyEarning_userId_year_month_key";
CREATE UNIQUE INDEX "MonthlyEarning_userId_year_month_currency_key"
    ON "MonthlyEarning"("userId", "year", "month", "currency");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'MonthlyEarning_userId_fkey'
    ) THEN
        ALTER TABLE "MonthlyEarning"
        ADD CONSTRAINT "MonthlyEarning_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
