ALTER TABLE "ImportJob" ADD COLUMN "publishedVersionId" TEXT;

CREATE UNIQUE INDEX "ImportJob_publishedVersionId_key" ON "ImportJob"("publishedVersionId");

ALTER TABLE "ImportJob"
ADD CONSTRAINT "ImportJob_publishedVersionId_fkey"
FOREIGN KEY ("publishedVersionId") REFERENCES "LibraryVersion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
