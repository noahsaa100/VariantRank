import { describe, expect, it, vi } from 'vitest';

vi.mock('../aiAssistService', () => ({
  evaluateCriteriaWithAi: vi.fn(async () => []),
}));

import { evaluateCriteriaForPage, selectApplicableCriteria, type ActiveCriterion } from '../criterionEvaluationService';
import { evaluateCriteriaWithAi } from '../aiAssistService';
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

  it('does not apply product purchase checks to cart pages even when imported as sitewide', async () => {
    const cartPage = { ...page, pageType: 'cart' as const };
    const evaluated = await evaluateCriteriaForPage([
      criterion({ description: 'The main add to cart CTA is descriptive', pageAreas: ['Cart / cart drawer', 'Sitewide'] }),
    ], cartPage);

    expect(evaluated.results[0].status).toBe('NOT_RELEVANT');
    expect(evaluated.scoreSummary.overallScore).toBeNull();
  });

  it('does not turn one isolated small control into a rule penalty', async () => {
    const touchViewport = {
      ...viewport,
      controls: [
        { tag: 'button', text: 'Menu', type: null, ariaLabel: 'Menu', width: 20, height: 20, visible: true, x: 0, y: 0, region: 'page' as const },
        { tag: 'button', text: 'Buy', type: null, ariaLabel: null, width: 48, height: 48, visible: true, x: 0, y: 30, region: 'purchase' as const },
      ],
    };
    const evaluated = await evaluateCriteriaForPage([
      criterion({ description: 'Mobile touch target sizes meet the 44px recommendation', pageAreas: ['Product page'] }),
    ], { ...page, desktop: touchViewport, mobile: touchViewport });

    expect(evaluated.results[0].status).toBe('CAN_BE_IMPROVED');
    expect(evaluated.results[0].scoreImpact.penaltyPoints).toBeUndefined();
  });

  it('counts duplicate imported failures only once', async () => {
    const evaluated = await evaluateCriteriaForPage([
      criterion({ id: 'alt-1' }),
      criterion({ id: 'alt-2' }),
    ], page);

    expect(evaluated.results.filter((result) => (result.scoreImpact.penaltyPoints ?? 0) > 0)).toHaveLength(1);
  });

  it('evaluates imported checks across multiple response batches', async () => {
    const mockedEvaluate = vi.mocked(evaluateCriteriaWithAi);
    mockedEvaluate.mockImplementation(async (input) => input.criteria.map((item) => ({
      criterionId: item.id,
      status: 'GOOD' as const,
      evidence: 'The supplied rendered evidence satisfies this check.',
      confidence: 0.9,
    })));
    const imported = Array.from({ length: 17 }, (_, index) => criterion({
      id: `imported-${index}`,
      title: `Imported check ${index}`,
      description: `Inspect imported requirement ${index}`,
      defaultMethod: 'AI_ASSISTED',
      evidenceRequirements: {
        statusDefinitions: {
          good: 'The requirement is satisfied.',
          canBeImproved: 'The requirement is partially satisfied.',
          bad: 'The requirement is not satisfied.',
        },
      },
    }));

    const evaluated = await evaluateCriteriaForPage(imported, page);

    expect(mockedEvaluate).toHaveBeenCalledTimes(3);
    expect(mockedEvaluate.mock.calls.map(([input]) => input.criteria.length)).toEqual([8, 8, 1]);
    expect(evaluated.results).toHaveLength(17);
    expect(evaluated.results.every((result) => result.status === 'GOOD')).toBe(true);
    mockedEvaluate.mockReset();
  });

});
