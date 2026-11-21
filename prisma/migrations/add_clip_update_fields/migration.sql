-- Issue #1361: user-editable clip fields
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "Clip" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
