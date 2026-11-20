CREATE TABLE "NftCollection" (
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "royaltyBps" INTEGER,
    "maxSupply" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NftCollection_pkey" PRIMARY KEY ("collectionId")
);

CREATE INDEX "NftCollection_type_idx" ON "NftCollection"("type");

INSERT INTO "NftCollection" ("collectionId", "name", "description", "type", "metadata", "updatedAt") VALUES
    ('viral-clips', 'Viral Clips', 'Short-form clips selected for viral potential.', 'viral', '{"category":"viral","schemaVersion":1}'::jsonb, CURRENT_TIMESTAMP),
    ('podcast-highlights', 'Podcast Highlights', 'Memorable moments from podcasts and interviews.', 'podcast', '{"category":"podcast","schemaVersion":1}'::jsonb, CURRENT_TIMESTAMP),
    ('comedy-clips', 'Comedy Clips', 'Comedy moments and standout performances.', 'comedy', '{"category":"comedy","schemaVersion":1}'::jsonb, CURRENT_TIMESTAMP),
    ('educational-clips', 'Educational Clips', 'Educational clips and explainers.', 'educational', '{"category":"educational","schemaVersion":1}'::jsonb, CURRENT_TIMESTAMP);

ALTER TABLE "Clip" ADD COLUMN "collectionId" TEXT NOT NULL DEFAULT 'viral-clips';

CREATE INDEX "Clip_collectionId_mintAddress_idx" ON "Clip"("collectionId", "mintAddress");

ALTER TABLE "Clip"
ADD CONSTRAINT "Clip_collectionId_fkey"
FOREIGN KEY ("collectionId") REFERENCES "NftCollection"("collectionId")
ON DELETE RESTRICT ON UPDATE CASCADE;