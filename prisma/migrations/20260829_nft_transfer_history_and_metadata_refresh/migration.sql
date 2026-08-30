-- Issue #841: NFT transfer history indexed from Soroban Transfer events
CREATE TABLE IF NOT EXISTS "NftTransfer" (
    "id" SERIAL NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "salePrice" BIGINT,
    "contractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NftTransfer_txHash_tokenId_key" ON "NftTransfer"("txHash", "tokenId");
CREATE INDEX IF NOT EXISTS "NftTransfer_tokenId_idx" ON "NftTransfer"("tokenId");
CREATE INDEX IF NOT EXISTS "NftTransfer_transferredAt_idx" ON "NftTransfer"("transferredAt");
CREATE INDEX IF NOT EXISTS "NftTransfer_tokenId_transferredAt_idx" ON "NftTransfer"("tokenId", "transferredAt");

-- Issue #837: Backend-tracked metadata refresh cooldown (30 days)
CREATE TABLE IF NOT EXISTS "NftMetadataRefresh" (
    "id" SERIAL NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "adminAddress" TEXT NOT NULL,
    "txHash" TEXT,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NftMetadataRefresh_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NftMetadataRefresh_tokenId_idx" ON "NftMetadataRefresh"("tokenId");
CREATE INDEX IF NOT EXISTS "NftMetadataRefresh_tokenId_refreshedAt_idx" ON "NftMetadataRefresh"("tokenId", "refreshedAt");
