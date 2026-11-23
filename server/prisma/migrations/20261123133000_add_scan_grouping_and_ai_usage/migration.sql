ALTER TABLE "Evaluation" ADD COLUMN "aiUsage" JSONB;

ALTER TABLE "Variant"
  ADD COLUMN "siteRootUrl" TEXT,
  ADD COLUMN "pageType" TEXT;

CREATE INDEX "Variant_siteRootUrl_idx" ON "Variant"("siteRootUrl");
