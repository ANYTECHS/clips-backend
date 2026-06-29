-- AlterTable
ALTER TABLE "Payout" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT;

-- CreateTable
CREATE TABLE "MonthlyEarning" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "platformBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyEarning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyEarning_userId_idx" ON "MonthlyEarning"("userId");

-- CreateIndex
CREATE INDEX "MonthlyEarning_year_month_idx" ON "MonthlyEarning"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyEarning_userId_year_month_key" ON "MonthlyEarning"("userId", "year", "month");
