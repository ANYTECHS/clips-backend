ALTER TABLE "Payout"
ADD COLUMN IF NOT EXISTS "transactionId" TEXT,
ADD COLUMN IF NOT EXISTS "externalTransactionId" TEXT,
ADD COLUMN IF NOT EXISTS "stellarXdr" TEXT,
ADD COLUMN IF NOT EXISTS "onChainTxHash" TEXT,
ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "confirmationPollCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastConfirmationCheckAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Payout_method_status_onChainTxHash_idx"
ON "Payout"("method", "status", "onChainTxHash");
