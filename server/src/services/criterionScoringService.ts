import {
  SCORE_CATEGORIES,
  type CriterionScoreSummary,
  type CriterionStatus,
  type ScoredCriterionResult,
  type ScoreCategory,
} from '../types/criterionScoring';

const ASSESSED_STATUSES: CriterionStatus[] = ['GOOD', 'CAN_BE_IMPROVED', 'BAD'];

function roundScore(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(1));
}

function statusCredit(status: CriterionStatus, partialCredit: number): number | null {
  if (status === 'GOOD') return 1;
  if (status === 'CAN_BE_IMPROVED') return partialCredit;
  if (status === 'BAD') return 0;
  return null;
}

function weightedAverage(
  entries: Array<{ credit: number; weight: number }>,
): number | null {
  const eligible = entries.filter(({ weight }) => Number.isFinite(weight) && weight > 0);
  const denominator = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  if (denominator === 0) return null;
  return roundScore(
    (eligible.reduce((sum, entry) => sum + entry.credit * entry.weight, 0) / denominator) * 100,
  );
}

export function calculateCriterionScores(
  results: ScoredCriterionResult[],
  options: {
    partialCredit?: number;
    categoryWeights?: Partial<Record<ScoreCategory, number>>;
  } = {},
): CriterionScoreSummary {
  const partialCredit = options.partialCredit ?? 0.5;
  if (partialCredit < 0 || partialCredit > 1) {
    throw new Error('partialCredit must be between 0 and 1');
  }

  // A canonical criterion must never count twice, even if an import contained
  // the same Cake practice under several outcome sheets.
  const uniqueResults = new Map<string, ScoredCriterionResult>();
  for (const result of results) {
    if (uniqueResults.has(result.criterionId)) {
      throw new Error(`Duplicate criterion result: ${result.criterionId}`);
    }
    uniqueResults.set(result.criterionId, result);
  }

  const values = [...uniqueResults.values()];
  const assessed = values.filter((result) => ASSESSED_STATUSES.includes(result.status));
  // Preserve Cake's current dashboard formula exactly: it is an unweighted
  // pass rate, while VariantRank quality below is the weighted predictive view.
  const goodCount = assessed.filter((result) => result.status === 'GOOD').length;
  const cakeCompliance = assessed.length > 0
    ? roundScore((goodCount / assessed.length) * 100)
    : null;

  const qualityScore = weightedAverage(
    assessed.map((result) => ({
      credit: statusCredit(result.status, partialCredit) ?? 0,
      weight: result.importanceWeight,
    })),
  );

  const categoryScores: Partial<Record<ScoreCategory, number>> = {};
  for (const category of SCORE_CATEGORIES) {
    const categoryEntries = assessed.flatMap((result) => {
      const mapping = result.categoryMappings.find((item) => item.category === category);
      const credit = statusCredit(result.status, partialCredit);
      if (!mapping || credit === null) return [];
      return [{ credit, weight: result.importanceWeight * mapping.weight }];
    });
    const score = weightedAverage(categoryEntries);
    if (score !== null) categoryScores[category] = score;
  }

  const categoryEntries = Object.entries(categoryScores).map(([category, score]) => ({
    credit: score / 100,
    weight: options.categoryWeights?.[category as ScoreCategory] ?? 1,
  }));

  return {
    cakeCompliance,
    qualityScore,
    categoryScores,
    overallScore: weightedAverage(categoryEntries),
    coverage: {
      total: values.length,
      assessed: assessed.length,
      notRelevant: values.filter((result) => result.status === 'NOT_RELEVANT').length,
      needsReview: values.filter((result) => result.status === 'NEEDS_REVIEW').length,
      notObserved: values.filter((result) => result.status === 'NOT_OBSERVED').length,
    },
  };
}
