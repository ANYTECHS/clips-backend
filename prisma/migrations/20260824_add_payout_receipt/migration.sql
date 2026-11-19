-- Create PayoutReceipt table
CREATE TABLE "PayoutReceipt" (
  "id" SERIAL NOT NULL PRIMARY KEY,
  "payoutId" INTEGER NOT NULL UNIQUE,
  "receiptId" TEXT NOT NULL UNIQUE,
  "pdfUrl" TEXT,
  "pdfStoragePath" TEXT,
  "emailSent" BOOLEAN NOT NULL DEFAULT false,
  "emailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayoutReceipt_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout" ("id") ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX "PayoutReceipt_payoutId_idx" ON "PayoutReceipt"("payoutId");
CREATE INDEX "PayoutReceipt_receiptId_idx" ON "PayoutReceipt"("receiptId");
CREATE INDEX "PayoutReceipt_emailSent_idx" ON "PayoutReceipt"("emailSent");
