import { describe, expect, it, vi } from 'vitest';

vi.mock('../aiAssistService', () => ({
  evaluateCriteriaWithAi: vi.fn(async () => []),
}));

import { evaluateCriteriaForPage, selectApplicableCriteria, type ActiveCriterion } from '../criterionEvaluationService';
import type { RenderedPageEvidence } from '../renderedPageCollector';

const mapping = [{ category: 'TECHNICAL_ACCESSIBILITY' as const, weight: 1, isPrimary: true }];

function criterion(overrides: Partial<ActiveCriterion> = {}): ActiveCriterion {
  return {
    id: 'criterion-1',
    title: 'Image alt text',
    description: 'Every image has descriptive alt text',
    rationale: null,
    pageAreas: ['Product page'],
    importanceWeight: 1,
    defaultMethod: 'AUTOMATED',
    categoryMappings: mapping,
    ...overrides,
  };
}

const viewport = {
  visibleText: 'Product page',
  controls: [],
  headings: [{ level: 1, text: 'Product' }],
  imageCount: 10,
  imagesMissingAlt: 2,
  formCount: 0,
  formFieldCount: 0,
  linkCount: 1,
  screenshotBase64: 'jpeg',
};

const page: RenderedPageEvidence = {
  url: 'https://shop.example/products/item',
  finalUrl: 'https://shop.example/products/item',
  html: '<html></html>',
  pageType: 'product',
  desktop: viewport,
  mobile: viewport,
};

describe('criterionEvaluationService', () => {
  it('selects product and sitewide checks but not checkout checks', () => {
    const selected = selectApplicableCriteria([
      criterion(),
      criterion({ id: 'sitewide', pageAreas: ['Sitewide'] }),
      criterion({ id: 'checkout', pageAreas: ['Checkout'] }),
    ], 'product');

    expect(selected.map((item) => item.id)).toEqual(['criterion-1', 'sitewide']);
  });

  it('turns rendered evidence into a scored deterministic verdict', async () => {
    const evaluated = await evaluateCriteriaForPage([criterion()], page);

    expect(evaluated.results[0]).toMatchObject({
      criterionId: 'criterion-1',
      status: 'BAD',
      method: 'AUTOMATED',
    });
    expect(evaluated.results[0].evidence.summary).toContain('2 of 10');
    expect(evaluated.scoreSummary.categoryScores.TECHNICAL_ACCESSIBILITY).toBe(0);
  });

  it('keeps manual checks out of paid AI evaluation', async () => {
    const evaluated = await evaluateCriteriaForPage([
      criterion({ id: 'manual', description: 'Judge whether the visual hierarchy is persuasive', defaultMethod: 'MANUAL' }),
    ], page);

    expect(evaluated.results[0]).toMatchObject({ status: 'NEEDS_REVIEW', method: 'MANUAL' });
  });
});
