-- CreateTable
CREATE TABLE "PayoutMethod" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "encryptedAccountNumber" TEXT,
    "encryptedRoutingNumber" TEXT,
    "encryptedSwiftCode" TEXT,
    "encryptedIban" TEXT,
    "bankName" TEXT,
    "accountHolderName" TEXT,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastFourDigits" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PayoutMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutMethod_userId_idx" ON "PayoutMethod"("userId");

-- CreateIndex
CREATE INDEX "PayoutMethod_type_idx" ON "PayoutMethod"("type");

-- AddForeignKey
ALTER TABLE "PayoutMethod" ADD CONSTRAINT "PayoutMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- Add payoutMethodId to Payout table
ALTER TABLE "Payout" ADD COLUMN "payoutMethodId" INTEGER;

-- CreateIndex
CREATE INDEX "Payout_payoutMethodId_idx" ON "Payout"("payoutMethodId");

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_payoutMethodId_fkey" FOREIGN KEY ("payoutMethodId") REFERENCES "PayoutMethod"("id") ON DELETE SET NULL;
