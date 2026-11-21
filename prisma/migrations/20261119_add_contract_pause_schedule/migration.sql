-- Migration: add ContractPauseSchedule table (Issue #1048)
-- Tracks the 24-hour timelock pause lifecycle for the Soroban NFT contract.

CREATE TABLE "ContractPauseSchedule" (
    "id"           SERIAL         NOT NULL,
    "requestedBy"  TEXT           NOT NULL,
    "requestedAt"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3)   NOT NULL,
    "activatedAt"  TIMESTAMP(3),
    "cancelledAt"  TIMESTAMP(3),
    "cancelledBy"  TEXT,
    "reason"       TEXT,
    "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)   NOT NULL,

    CONSTRAINT "ContractPauseSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractPauseSchedule_requestedAt_idx"  ON "ContractPauseSchedule"("requestedAt");
CREATE INDEX "ContractPauseSchedule_scheduledFor_idx" ON "ContractPauseSchedule"("scheduledFor");
CREATE INDEX "ContractPauseSchedule_activatedAt_idx"  ON "ContractPauseSchedule"("activatedAt");
CREATE INDEX "ContractPauseSchedule_cancelledAt_idx"  ON "ContractPauseSchedule"("cancelledAt");
