ALTER TABLE "LibraryVersion" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "LibraryVersion_libraryId_isActive_idx" ON "LibraryVersion"("libraryId", "isActive");
