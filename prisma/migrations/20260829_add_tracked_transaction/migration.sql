-- CreateTable
CREATE TABLE "TrackedTransaction" (
    "id" SERIAL NOT NULL,
    "hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "label" TEXT,
    "userId" INTEGER,
    "failureReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedTransaction_hash_key" ON "TrackedTransaction"("hash");

-- CreateIndex
CREATE INDEX "TrackedTransaction_status_idx" ON "TrackedTransaction"("status");

-- CreateIndex
CREATE INDEX "TrackedTransaction_lastCheckedAt_idx" ON "TrackedTransaction"("lastCheckedAt");

-- CreateIndex
CREATE INDEX "TrackedTransaction_userId_idx" ON "TrackedTransaction"("userId");
