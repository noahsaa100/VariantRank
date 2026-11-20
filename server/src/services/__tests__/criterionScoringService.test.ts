import { describe, expect, it } from 'vitest';
import { calculateCriterionScores } from '../criterionScoringService';
import type { ScoredCriterionResult } from '../../types/criterionScoring';

const result = (
  criterionId: string,
  status: ScoredCriterionResult['status'],
  category: ScoredCriterionResult['categoryMappings'][number]['category'],
  importanceWeight = 1,
): ScoredCriterionResult => ({
  criterionId,
  status,
  importanceWeight,
  categoryMappings: [{ category, weight: 1, isPrimary: true }],
});

describe('criterionScoringService', () => {
  it('calculates Cake compliance separately from partial-credit quality', () => {
    const summary = calculateCriterionScores([
      result('good', 'GOOD', 'SHOPPING_UX'),
      result('improve', 'CAN_BE_IMPROVED', 'SHOPPING_UX'),
      result('bad', 'BAD', 'TRUST_CONFIDENCE'),
    ]);

    expect(summary.cakeCompliance).toBe(33.3);
    expect(summary.qualityScore).toBe(50);
    expect(summary.categoryScores).toEqual({
      SHOPPING_UX: 75,
      TRUST_CONFIDENCE: 0,
    });
    expect(summary.overallScore).toBe(37.5);
  });

  it('excludes unassessed statuses and reports coverage honestly', () => {
    const summary = calculateCriterionScores([
      result('good', 'GOOD', 'OFFER_CLARITY'),
      result('na', 'NOT_RELEVANT', 'OFFER_CLARITY'),
      result('review', 'NEEDS_REVIEW', 'PURCHASE_EASE'),
      result('missing', 'NOT_OBSERVED', 'TECHNICAL_ACCESSIBILITY'),
    ]);

    expect(summary.cakeCompliance).toBe(100);
    expect(summary.qualityScore).toBe(100);
    expect(summary.coverage).toEqual({
      total: 4,
      assessed: 1,
      notRelevant: 1,
      needsReview: 1,
      notObserved: 1,
    });
  });

  it('uses criterion and category weights without double-counting outcome mappings', () => {
    const summary = calculateCriterionScores(
      [
        result('ux', 'GOOD', 'SHOPPING_UX', 2),
        result('trust', 'BAD', 'TRUST_CONFIDENCE', 1),
      ],
      { categoryWeights: { SHOPPING_UX: 3, TRUST_CONFIDENCE: 1 } },
    );

    expect(summary.cakeCompliance).toBe(50);
    expect(summary.categoryScores).toEqual({ SHOPPING_UX: 100, TRUST_CONFIDENCE: 0 });
    expect(summary.overallScore).toBe(75);
  });

  it('rejects duplicate canonical criterion results', () => {
    expect(() => calculateCriterionScores([
      result('same', 'GOOD', 'SHOPPING_UX'),
      result('same', 'BAD', 'TRUST_CONFIDENCE'),
    ])).toThrow('Duplicate criterion result: same');
  });

  it('dampens uncertain verdicts and excludes confidence below the reliability floor', () => {
    const uncertainBad = { ...result('uncertain', 'BAD', 'TRUST_CONFIDENCE'), confidence: 0.7 };
    const unreliableBad = { ...result('unreliable', 'BAD', 'OFFER_CLARITY'), confidence: 0.55 };
    const summary = calculateCriterionScores([uncertainBad, unreliableBad]);

    expect(summary.categoryScores.TRUST_CONFIDENCE).toBe(25);
    expect(summary.categoryScores.OFFER_CLARITY).toBeUndefined();
    expect(summary.coverage.assessed).toBe(1);
    expect(summary.coverage.notObserved).toBe(1);
  });
});
