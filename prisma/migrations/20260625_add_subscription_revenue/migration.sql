-- Revenue records for Stellar subscription payments.
-- Each row captures the full accounting metadata for one confirmed payment,
-- indexed for reconciliation queries by subscription and processing date.

CREATE TABLE "SubscriptionRevenue" (
  "id"              SERIAL       NOT NULL,
  "subscriptionId"  INTEGER      NOT NULL,
  "transactionHash" TEXT         NOT NULL,
  "payerAddress"    TEXT         NOT NULL,
  "amount"          DOUBLE PRECISION NOT NULL,
  "assetType"       TEXT         NOT NULL,
  "memo"            TEXT         NOT NULL,
  "processedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubscriptionRevenue_pkey" PRIMARY KEY ("id")
);

-- Idempotency: each on-chain transaction can produce at most one revenue record.
CREATE UNIQUE INDEX "SubscriptionRevenue_transactionHash_key"
  ON "SubscriptionRevenue"("transactionHash");

CREATE INDEX "SubscriptionRevenue_subscriptionId_idx"
  ON "SubscriptionRevenue"("subscriptionId");

CREATE INDEX "SubscriptionRevenue_processedAt_idx"
  ON "SubscriptionRevenue"("processedAt");

ALTER TABLE "SubscriptionRevenue"
  ADD CONSTRAINT "SubscriptionRevenue_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId")
  REFERENCES "Subscription"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
