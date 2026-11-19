-- Issue #840: royalty claim history
-- Issue #845: Soroban contract event indexer storage

CREATE TABLE IF NOT EXISTS "RoyaltyClaim" (
    "id" SERIAL NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "assetContractId" TEXT,
    "txHash" TEXT NOT NULL,
    "ledger" INTEGER,
    "eventIndex" INTEGER,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoyaltyClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RoyaltyClaim_txHash_key" ON "RoyaltyClaim"("txHash");
CREATE INDEX IF NOT EXISTS "RoyaltyClaim_tokenId_claimedAt_idx" ON "RoyaltyClaim"("tokenId", "claimedAt");
CREATE INDEX IF NOT EXISTS "RoyaltyClaim_recipient_idx" ON "RoyaltyClaim"("recipient");

CREATE TABLE IF NOT EXISTS "BlockchainEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "tokenId" INTEGER,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "amount" TEXT,
    "asset" TEXT,
    "txHash" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "ledger" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockchainEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlockchainEvent_txHash_eventIndex_key" ON "BlockchainEvent"("txHash", "eventIndex");
CREATE INDEX IF NOT EXISTS "BlockchainEvent_eventType_idx" ON "BlockchainEvent"("eventType");
CREATE INDEX IF NOT EXISTS "BlockchainEvent_tokenId_idx" ON "BlockchainEvent"("tokenId");
CREATE INDEX IF NOT EXISTS "BlockchainEvent_ledger_idx" ON "BlockchainEvent"("ledger");
CREATE INDEX IF NOT EXISTS "BlockchainEvent_createdAt_idx" ON "BlockchainEvent"("createdAt");

CREATE TABLE IF NOT EXISTS "IndexerState" (
    "id" TEXT NOT NULL,
    "lastLedger" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);
