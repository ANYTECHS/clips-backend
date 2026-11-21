DROP INDEX IF EXISTS "MonthlyEarning_userId_year_month_key";

CREATE UNIQUE INDEX "MonthlyEarning_userId_year_month_currency_key"
ON "MonthlyEarning"("userId", "year", "month", "currency");
