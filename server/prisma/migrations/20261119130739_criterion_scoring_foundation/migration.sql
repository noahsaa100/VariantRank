-- CreateEnum
CREATE TYPE "LibraryVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('PENDING', 'PARSING', 'NEEDS_REVIEW', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportCandidateStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateEnum
CREATE TYPE "CriterionEvaluationStatus" AS ENUM ('GOOD', 'CAN_BE_IMPROVED', 'BAD', 'NOT_RELEVANT', 'NEEDS_REVIEW', 'NOT_OBSERVED');

-- CreateEnum
CREATE TYPE "CriterionEvaluationMethod" AS ENUM ('AUTOMATED', 'AI_ASSISTED', 'MANUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "ScoreCategoryKey" AS ENUM ('SHOPPING_UX', 'TRUST_CONFIDENCE', 'OFFER_CLARITY', 'PURCHASE_EASE', 'TECHNICAL_ACCESSIBILITY');

-- CreateEnum
CREATE TYPE "BusinessOutcomeKey" AS ENUM ('INCREASE_ATC', 'INCREASE_PRODUCT_VIEWS', 'INCREASE_CONVERSION', 'INCREASE_AOV', 'ENHANCE_BRAND_PERCEPTION', 'DECREASE_SITE_ABANDONMENT', 'WEB_ACCESSIBILITY', 'THANK_YOU_PAGE');

-- CreateTable
CREATE TABLE "BestPracticeLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "organisationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BestPracticeLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryVersion" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "LibraryVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "libraryVersionId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT,
    "guidance" TEXT,
    "pageAreas" TEXT[],
    "applicability" JSONB,
    "evidenceRequirements" JSONB,
    "defaultMethod" "CriterionEvaluationMethod" NOT NULL,
    "importanceWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "includedInCakeTheme" BOOLEAN,
    "customWorkRequired" BOOLEAN,
    "integrationRequired" BOOLEAN,
    "clientResponsibility" BOOLEAN,
    "exampleUrl" TEXT,
    "exampleAssetRef" TEXT,
    "sourceReferences" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionCategoryMapping" (
    "id" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "category" "ScoreCategoryKey" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CriterionCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionOutcomeMapping" (
    "id" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "outcome" "BusinessOutcomeKey" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "CriterionOutcomeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringProfile" (
    "id" TEXT NOT NULL,
    "libraryVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "qualityPartialCredit" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringCategoryWeight" (
    "id" TEXT NOT NULL,
    "scoringProfileId" TEXT NOT NULL,
    "category" "ScoreCategoryKey" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ScoringCategoryWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionEvaluationResult" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "status" "CriterionEvaluationStatus" NOT NULL,
    "method" "CriterionEvaluationMethod" NOT NULL,
    "evidence" JSONB NOT NULL,
    "explanation" TEXT,
    "confidence" DOUBLE PRECISION,
    "scoreImpact" JSONB,
    "evaluatorVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CriterionEvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "checksum" TEXT,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "sourceMetadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportCandidate" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "status" "ImportCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "sourceSheet" TEXT,
    "sourceRow" INTEGER,
    "rawData" JSONB NOT NULL,
    "proposedCriterion" JSONB NOT NULL,
    "suggestedCanonicalKey" TEXT,
    "duplicateCriterionId" TEXT,
    "extractionConfidence" DOUBLE PRECISION,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BestPracticeLibrary_slug_key" ON "BestPracticeLibrary"("slug");

-- CreateIndex
CREATE INDEX "LibraryVersion_libraryId_status_idx" ON "LibraryVersion"("libraryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryVersion_libraryId_version_key" ON "LibraryVersion"("libraryId", "version");

-- CreateIndex
CREATE INDEX "Criterion_libraryVersionId_idx" ON "Criterion"("libraryVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Criterion_libraryVersionId_canonicalKey_key" ON "Criterion"("libraryVersionId", "canonicalKey");

-- CreateIndex
CREATE INDEX "CriterionCategoryMapping_category_idx" ON "CriterionCategoryMapping"("category");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionCategoryMapping_criterionId_category_key" ON "CriterionCategoryMapping"("criterionId", "category");

-- CreateIndex
CREATE INDEX "CriterionOutcomeMapping_outcome_idx" ON "CriterionOutcomeMapping"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionOutcomeMapping_criterionId_outcome_key" ON "CriterionOutcomeMapping"("criterionId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringProfile_libraryVersionId_name_key" ON "ScoringProfile"("libraryVersionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringCategoryWeight_scoringProfileId_category_key" ON "ScoringCategoryWeight"("scoringProfileId", "category");

-- CreateIndex
CREATE INDEX "CriterionEvaluationResult_variantId_status_idx" ON "CriterionEvaluationResult"("variantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionEvaluationResult_variantId_criterionId_key" ON "CriterionEvaluationResult"("variantId", "criterionId");

-- CreateIndex
CREATE INDEX "ImportCandidate_importJobId_status_idx" ON "ImportCandidate"("importJobId", "status");

-- AddForeignKey
ALTER TABLE "LibraryVersion" ADD CONSTRAINT "LibraryVersion_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "BestPracticeLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_libraryVersionId_fkey" FOREIGN KEY ("libraryVersionId") REFERENCES "LibraryVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionCategoryMapping" ADD CONSTRAINT "CriterionCategoryMapping_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionOutcomeMapping" ADD CONSTRAINT "CriterionOutcomeMapping_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringProfile" ADD CONSTRAINT "ScoringProfile_libraryVersionId_fkey" FOREIGN KEY ("libraryVersionId") REFERENCES "LibraryVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringCategoryWeight" ADD CONSTRAINT "ScoringCategoryWeight_scoringProfileId_fkey" FOREIGN KEY ("scoringProfileId") REFERENCES "ScoringProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionEvaluationResult" ADD CONSTRAINT "CriterionEvaluationResult_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionEvaluationResult" ADD CONSTRAINT "CriterionEvaluationResult_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "BestPracticeLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportCandidate" ADD CONSTRAINT "ImportCandidate_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
