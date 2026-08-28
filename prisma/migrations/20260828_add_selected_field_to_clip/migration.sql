-- Add selected field to Clip model for bulk update feature (#728)
ALTER TABLE "Clip" ADD COLUMN "selected" BOOLEAN DEFAULT false;

-- Add index for selected field queries
CREATE INDEX "Clip_selected_idx" ON "Clip"("selected");