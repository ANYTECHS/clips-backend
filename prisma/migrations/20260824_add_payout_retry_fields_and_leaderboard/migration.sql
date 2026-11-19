-- Add retry fields to Payout table
ALTER TABLE "Payout"
ADD COLUMN "nextRetryAt" TIMESTAMP(3),
ADD COLUMN "failureReason" TEXT;

-- Create index for retry polling
CREATE INDEX "idx_payout_next_retry_at" ON "Payout"("nextRetryAt") WHERE "nextRetryAt" IS NOT NULL;

-- Add leaderboard visibility to User
ALTER TABLE "User"
ADD COLUMN "showOnLeaderboard" BOOLEAN NOT NULL DEFAULT false;

-- Create index for leaderboard queries (combined with earnings)
CREATE INDEX "idx_user_show_on_leaderboard" ON "User"("showOnLeaderboard");
