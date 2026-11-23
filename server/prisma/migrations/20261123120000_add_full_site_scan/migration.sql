CREATE TYPE "EvaluationMode" AS ENUM ('SINGLE_PAGE', 'FULL_SITE');

ALTER TABLE "Evaluation"
  ADD COLUMN "scanMode" "EvaluationMode" NOT NULL DEFAULT 'SINGLE_PAGE',
  ADD COLUMN "siteSummary" JSONB,
  ADD COLUMN "crawlReport" JSONB;
