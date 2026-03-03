import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic score generation based on URL characteristics
function hashUrl(url: string): number {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededRandom(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000;
  const frac = x - Math.floor(x);
  return parseFloat((min + frac * (max - min)).toFixed(1));
}

function generateCategoryScores(url: string): Record<string, number> {
  const base = hashUrl(url);
  return {
    design:        seededRandom(base + 1, 40, 95),
    performance:   seededRandom(base + 2, 35, 90),
    copywriting:   seededRandom(base + 3, 45, 92),
    trustSignals:  seededRandom(base + 4, 30, 88),
    ux:            seededRandom(base + 5, 50, 95),
  };
}

function computeTotalScore(scores: Record<string, number>): number {
  const weights: Record<string, number> = {
    design:       0.2,
    performance:  0.25,
    copywriting:  0.2,
    trustSignals: 0.15,
    ux:           0.2,
  };
  const total = Object.entries(scores).reduce(
    (sum, [key, val]) => sum + val * (weights[key] ?? 0.2),
    0,
  );
  return parseFloat(total.toFixed(2));
}

const RULES = [
  { rule: 'Missing HTTPS', penalty: -10 },
  { rule: 'No clear CTA', penalty: -8 },
  { rule: 'Slow page load (>3s)', penalty: -12 },
  { rule: 'Low contrast text', penalty: -5 },
  { rule: 'Missing meta description', penalty: -4 },
  { rule: 'No social proof', penalty: -6 },
];

function generateRulePenalties(url: string): Array<{ rule: string; penalty: number }> {
  const base = hashUrl(url);
  return RULES.filter((_, i) => seededRandom(base + i + 100, 0, 1) > 0.5);
}

const DRIVERS = [
  'Strong hero headline',
  'Clear value proposition',
  'Fast load time',
  'Trust badges visible',
  'Responsive layout',
  'Compelling CTA button',
  'High-quality images',
  'Customer testimonials',
  'Clean navigation',
  'Mobile-optimized design',
];

function generateTopDrivers(url: string): string[] {
  const base = hashUrl(url);
  return DRIVERS.filter((_, i) => seededRandom(base + i + 200, 0, 1) > 0.55).slice(0, 4);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function generateFeatures(url: string): Record<string, any> {
  const base = hashUrl(url);
  return {
    hasCTA:           seededRandom(base + 300, 0, 1) > 0.3,
    hasTestimonials:  seededRandom(base + 301, 0, 1) > 0.5,
    hasVideo:         seededRandom(base + 302, 0, 1) > 0.6,
    hasPricing:       seededRandom(base + 303, 0, 1) > 0.5,
    hasFAQ:           seededRandom(base + 304, 0, 1) > 0.55,
    mobileFriendly:   seededRandom(base + 305, 0, 1) > 0.4,
    pageSpeedScore:   seededRandom(base + 306, 40, 100),
  };
}

export interface CreateEvaluationInput {
  urls: string[];
  goal: string;
  anonymousSessionId?: string;
}

export async function createEvaluation(input: CreateEvaluationInput) {
  const { urls, goal, anonymousSessionId } = input;
  const start = Date.now();

  const variantData = urls.map((url) => {
    const categoryScores = generateCategoryScores(url);
    const totalScore = computeTotalScore(categoryScores);
    return {
      url,
      totalScore,
      categoryScores,
      rulePenalties: generateRulePenalties(url),
      topDrivers: generateTopDrivers(url),
      features: generateFeatures(url),
    };
  });

  // Rank by totalScore descending (1 = best)
  const ranked = [...variantData].sort((a, b) => b.totalScore - a.totalScore);
  const rankMap = new Map(ranked.map((v, i) => [v.url, i + 1]));

  const processingTime = Date.now() - start;

  const evaluation = await prisma.evaluation.create({
    data: {
      goal,
      urls,
      anonymousSessionId: anonymousSessionId ?? null,
      processingTime,
      variants: {
        create: variantData.map((v) => ({
          url:           v.url,
          rank:          rankMap.get(v.url) ?? 1,
          totalScore:    v.totalScore,
          categoryScores: v.categoryScores,
          rulePenalties:  v.rulePenalties,
          topDrivers:     v.topDrivers,
          features:       v.features,
        })),
      },
    },
    include: { variants: true },
  });

  return evaluation;
}

export async function listEvaluations() {
  const evaluations = await prisma.evaluation.findMany({
    include: { variants: true },
    orderBy: { createdAt: 'desc' },
  });

  return evaluations.map((ev) => {
    const top = ev.variants.reduce(
      (best, v) => (v.totalScore > best.totalScore ? v : best),
      ev.variants[0],
    );
    return {
      id:        ev.id,
      createdAt: ev.createdAt,
      goal:      ev.goal,
      topScore:  top?.totalScore ?? null,
      topUrl:    top?.url ?? null,
    };
  });
}

export async function getEvaluation(id: string) {
  const evaluation = await prisma.evaluation.findUnique({
    where: { id },
    include: { variants: { orderBy: { rank: 'asc' } } },
  });
  return evaluation ?? null;
}
