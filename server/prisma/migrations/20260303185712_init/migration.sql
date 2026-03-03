-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goal" TEXT NOT NULL,
    "urls" JSONB NOT NULL,
    "anonymousSessionId" TEXT,
    "processingTime" INTEGER NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "categoryScores" JSONB NOT NULL,
    "rulePenalties" JSONB NOT NULL,
    "topDrivers" JSONB NOT NULL,
    "features" JSONB NOT NULL,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
