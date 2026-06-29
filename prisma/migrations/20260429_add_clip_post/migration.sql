-- CreateTable: ClipPost for tracking per-platform post attempts
CREATE TABLE "ClipPost" (
    "id"        SERIAL NOT NULL,
    "clipId"    INTEGER NOT NULL,
    "platform"  TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'pending',
    "postId"    TEXT,
    "attempts"  INTEGER NOT NULL DEFAULT 0,
    "error"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipPost_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClipPost" ADD CONSTRAINT "ClipPost_clipId_fkey"
    FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ClipPost_clipId_idx" ON "ClipPost"("clipId");
CREATE INDEX "ClipPost_platform_idx" ON "ClipPost"("platform");
