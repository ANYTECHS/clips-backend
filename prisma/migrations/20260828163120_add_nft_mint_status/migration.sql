-- CreateTable
CREATE TABLE "NftMintStatus" (
    "id" SERIAL NOT NULL,
    "clipId" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'none',
    "txHash" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "permanentFailure" BOOLEAN NOT NULL DEFAULT false,
    "metadataUri" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NftMintStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NftMintStatus_clipId_key" ON "NftMintStatus"("clipId");

-- CreateIndex
CREATE INDEX "NftMintStatus_clipId_idx" ON "NftMintStatus"("clipId");

-- CreateIndex
CREATE INDEX "NftMintStatus_stage_idx" ON "NftMintStatus"("stage");

-- CreateIndex
CREATE INDEX "NftMintStatus_permanentFailure_idx" ON "NftMintStatus"("permanentFailure");

-- AddForeignKey
ALTER TABLE "NftMintStatus" ADD CONSTRAINT "NftMintStatus_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
