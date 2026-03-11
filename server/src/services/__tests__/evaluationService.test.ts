import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  class PrismaClient {
    evaluation = {
      create: vi.fn(async ({ data }: { data: any }) => {
        const variants = (data.variants?.create ?? []).map((variant: any, idx: number) => ({
          id: `variant-${idx + 1}`,
          evaluationId: 'evaluation-1',
          ...variant,
        }));

        return {
          id: 'evaluation-1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          goal: data.goal,
          urls: data.urls,
          anonymousSessionId: data.anonymousSessionId,
          processingTime: data.processingTime,
          variants,
        };
      }),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      delete: vi.fn(async () => ({})),
    };

    variant = {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    };

    $transaction = vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations));
  }

  return {
    PrismaClient,
    Prisma: {},
  };
});

vi.mock('../pageFetcher', () => ({
  fetchPageHtml: vi.fn(),
}));

vi.mock('../aiAssistService', () => ({
  classifyPrimaryCtaWithAi: vi.fn(async () => null),
  mapGoalDescriptionWithAi: vi.fn(async () => null),
}));

import { createEvaluation } from '../evaluationService';
import { fetchPageHtml } from '../pageFetcher';

const PAGE_HTML = `
  <html>
    <head>
      <title>Acme</title>
      <meta name="description" content="Acme growth" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </head>
    <body>
      <h1>Grow pipeline</h1>
      <h2>Trusted by teams</h2>
      <p>Start free trial now and contact sales for setup support.</p>
      <button>Start free trial</button>
      <a href="/learn">Learn more</a>
      <form>
        <input name="email" />
        <input name="company" />
      </form>
    </body>
  </html>
`;

describe('evaluationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces deterministic scores for identical input', async () => {
    vi.mocked(fetchPageHtml).mockImplementation(async (url: string) => ({
      ok: true,
      html: PAGE_HTML,
      finalUrl: url,
      status: 200,
    }));

    const input = {
      urls: ['https://a.example', 'https://b.example'],
      goal: 'Lead generation',
    };

    const first = await createEvaluation(input);
    const second = await createEvaluation(input);

    const stableShape = (evaluation: any) =>
      [...evaluation.variants]
        .sort((a, b) => a.url.localeCompare(b.url))
        .map((variant) => ({
          url: variant.url,
          rank: variant.rank,
          totalScore: variant.totalScore,
          categoryScores: variant.categoryScores,
          rulePenalties: variant.rulePenalties,
          topDrivers: variant.topDrivers,
          features: variant.features,
        }));

    expect(stableShape(first)).toEqual(stableShape(second));
  });

  it('changes scoring output when goal weights differ', async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue({
      ok: true,
      html: PAGE_HTML,
      finalUrl: 'https://goal-diff.example',
      status: 200,
    });

    const leadEval = await createEvaluation({
      urls: ['https://goal-diff.example'],
      goal: 'Lead generation',
    });

    const contentEval = await createEvaluation({
      urls: ['https://goal-diff.example'],
      goal: 'Content engagement',
    });

    expect(leadEval.variants[0].totalScore).not.toBe(contentEval.variants[0].totalScore);
  });

  it('applies fallback features and penalties when page fetch fails', async () => {
    vi.mocked(fetchPageHtml).mockResolvedValue({
      ok: false,
      finalUrl: 'https://down.example',
      error: 'HTTP 500 Internal Server Error',
      status: 500,
    });

    const evaluation = await createEvaluation({
      urls: ['https://down.example'],
      goal: 'Lead generation',
    });

    const variant = evaluation.variants[0] as any;
    expect(variant.features.analysisError).toContain('HTTP 500');
    expect(Array.isArray(variant.rulePenalties)).toBe(true);
    expect(variant.rulePenalties[0].rule).toContain('Technical fallback: Page fetch failed');
    expect(variant.rulePenalties[0].penalty).toBeLessThan(0);
  });
});
