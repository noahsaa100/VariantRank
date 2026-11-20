export const SCORE_CATEGORIES = [
  'SHOPPING_UX',
  'TRUST_CONFIDENCE',
  'OFFER_CLARITY',
  'PURCHASE_EASE',
  'TECHNICAL_ACCESSIBILITY',
] as const;

export type ScoreCategory = (typeof SCORE_CATEGORIES)[number];

export type CriterionStatus =
  | 'GOOD'
  | 'CAN_BE_IMPROVED'
  | 'BAD'
  | 'NOT_RELEVANT'
  | 'NEEDS_REVIEW'
  | 'NOT_OBSERVED';

export interface ScoredCriterionResult {
  criterionId: string;
  status: CriterionStatus;
  importanceWeight: number;
  confidence?: number;
  categoryMappings: Array<{
    category: ScoreCategory;
    weight: number;
    isPrimary: boolean;
  }>;
}

export interface CriterionScoreSummary {
  cakeCompliance: number | null;
  qualityScore: number | null;
  categoryScores: Partial<Record<ScoreCategory, number>>;
  overallScore: number | null;
  coverage: {
    total: number;
    assessed: number;
    notRelevant: number;
    needsReview: number;
    notObserved: number;
  };
}
