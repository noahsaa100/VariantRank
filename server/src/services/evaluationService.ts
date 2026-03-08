import { Prisma, PrismaClient } from '@prisma/client';
import {
  createFallbackFeatures,
  extractFeaturesFromHtml,
  type ExtractedFeatures,
} from './htmlFeatureExtractor';
import { fetchPageHtml } from './pageFetcher';

const prisma = new PrismaClient();

type CategoryScores = {
  design: number;
  performance: number;
  copywriting: number;
  trustSignals: number;
  ux: number;
};

type RulePenalty = {
  rule: string;
  penalty: number;
};

interface VariantComputation {
  index: number;
  url: string;
  totalScore: number;
  categoryScores: CategoryScores;
  rulePenalties: RulePenalty[];
  topDrivers: string[];
  features: ExtractedFeatures;
}

function toScore(value: number): number {
  return Math.max(0, Math.min(100, parseFloat(value.toFixed(1))));
}

function deriveCategoryScores(features: ExtractedFeatures): CategoryScores {
  if (features.analysisError) {
    return {
      design: 10,
      performance: 8,
      copywriting: 10,
      trustSignals: 8,
      ux: 10,
    };
  }

  const design =
    30 +
    (features.viewportMetaPresent ? 15 : 0) +
    (features.h1Count === 1 ? 15 : features.h1Count > 1 ? 8 : 0) +
    (features.headingCount >= 4 ? 15 : features.headingCount >= 2 ? 8 : 0) +
    (features.navLinkCount >= 3 ? 10 : features.navLinkCount > 0 ? 5 : 0) +
    (features.titlePresent ? 10 : 0);

  const performance =
    30 +
    (features.httpsPresent ? 20 : 0) +
    (features.viewportMetaPresent ? 15 : 0) +
    (features.wordCount > 0 && features.wordCount <= 1800 ? 15 : 0) +
    (features.headingCount > 0 ? 10 : 0);

  const copywriting =
    20 +
    (features.titlePresent ? 15 : 0) +
    (features.metaDescriptionPresent ? 15 : 0) +
    (features.wordCount >= 120 ? 20 : features.wordCount >= 60 ? 10 : 0) +
    (features.ctaCount > 0 ? 15 : 0) +
    (features.primaryCtaText ? 15 : 0);

  const trustSignals =
    20 +
    (features.httpsPresent ? 20 : 0) +
    (features.testimonialKeywordsPresent ? 20 : 0) +
    (features.contactInfoPresent ? 20 : 0) +
    (features.faqKeywordsPresent ? 10 : 0) +
    (features.formPresent ? 10 : 0);

  const ux =
    25 +
    (features.viewportMetaPresent ? 15 : 0) +
    (features.navLinkCount >= 3 ? 15 : features.navLinkCount > 0 ? 8 : 0) +
    (features.formPresent ? 15 : 0) +
    (features.ctaCount > 0 ? 10 : 0) +
    (features.faqKeywordsPresent ? 10 : 0) +
    (features.h1Count === 1 ? 10 : 0);

  return {
    design: toScore(design),
    performance: toScore(performance),
    copywriting: toScore(copywriting),
    trustSignals: toScore(trustSignals),
    ux: toScore(ux),
  };
}

function computeTotalScore(scores: CategoryScores): number {
  const total =
    scores.design * 0.2 +
    scores.performance * 0.25 +
    scores.copywriting * 0.2 +
    scores.trustSignals * 0.15 +
    scores.ux * 0.2;

  return parseFloat(total.toFixed(2));
}

function deriveRulePenalties(features: ExtractedFeatures): RulePenalty[] {
  if (features.analysisError) {
    return [
      {
        rule: `Page fetch failed: ${features.analysisError}`,
        penalty: -30,
      },
    ];
  }

  const penalties: RulePenalty[] = [];

  if (!features.httpsPresent) penalties.push({ rule: 'Missing HTTPS', penalty: -10 });
  if (features.ctaCount === 0) penalties.push({ rule: 'No clear CTA', penalty: -8 });
  if (!features.metaDescriptionPresent) penalties.push({ rule: 'Missing meta description', penalty: -4 });
  if (!features.viewportMetaPresent) penalties.push({ rule: 'Missing viewport meta tag', penalty: -5 });
  if (!features.testimonialKeywordsPresent) penalties.push({ rule: 'No social proof cues', penalty: -6 });
  if (!features.contactInfoPresent) penalties.push({ rule: 'No visible contact info', penalty: -6 });
  if (features.wordCount < 80) penalties.push({ rule: 'Thin page content', penalty: -7 });

  return penalties;
}

function deriveTopDrivers(features: ExtractedFeatures): string[] {
  if (features.analysisError) {
    return ['Fallback analysis used due to fetch failure'];
  }

  const drivers: string[] = [];

  if (features.httpsPresent) drivers.push('HTTPS enabled');
  if (features.titlePresent && features.metaDescriptionPresent) drivers.push('Core messaging metadata present');
  if (features.viewportMetaPresent) drivers.push('Mobile viewport configured');
  if (features.primaryCtaText) drivers.push(`Primary CTA detected: ${features.primaryCtaText}`);
  if (features.formPresent) drivers.push('Lead capture form present');
  if (features.testimonialKeywordsPresent) drivers.push('Social proof language detected');
  if (features.faqKeywordsPresent) drivers.push('FAQ/help intent content detected');
  if (features.contactInfoPresent) drivers.push('Contact pathway visible');
  if (features.wordCount >= 250) drivers.push('Substantial on-page copy');

  return drivers.slice(0, 4);
}

async function analyzeVariant(url: string, index: number): Promise<VariantComputation> {
  try {
    const fetchResult = await fetchPageHtml(url);
    const features = fetchResult.ok
      ? extractFeaturesFromHtml(fetchResult.html, fetchResult.finalUrl)
      : createFallbackFeatures(fetchResult.finalUrl || url, fetchResult.error);

    const categoryScores = deriveCategoryScores(features);

    return {
      index,
      url,
      totalScore: computeTotalScore(categoryScores),
      categoryScores,
      rulePenalties: deriveRulePenalties(features),
      topDrivers: deriveTopDrivers(features),
      features,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected analysis error';
    const features = createFallbackFeatures(url, message);
    const categoryScores = deriveCategoryScores(features);

    return {
      index,
      url,
      totalScore: computeTotalScore(categoryScores),
      categoryScores,
      rulePenalties: deriveRulePenalties(features),
      topDrivers: deriveTopDrivers(features),
      features,
    };
  }
}

export interface CreateEvaluationInput {
  urls: string[];
  goal: string;
  anonymousSessionId?: string;
}

export async function createEvaluation(input: CreateEvaluationInput) {
  const { urls, goal, anonymousSessionId } = input;
  const start = Date.now();

  const variantData = await Promise.all(urls.map((url, index) => analyzeVariant(url, index)));

  const ranked = [...variantData].sort((a, b) => b.totalScore - a.totalScore);
  const rankMap = new Map<number, number>(ranked.map((variant, rankIndex) => [variant.index, rankIndex + 1]));

  const processingTime = Date.now() - start;

  const evaluation = await prisma.evaluation.create({
    data: {
      goal,
      urls,
      anonymousSessionId: anonymousSessionId ?? null,
      processingTime,
      variants: {
        create: variantData.map((variant) => ({
          url: variant.url,
          rank: rankMap.get(variant.index) ?? 1,
          totalScore: variant.totalScore,
          categoryScores: variant.categoryScores as unknown as Prisma.InputJsonValue,
          rulePenalties: variant.rulePenalties as unknown as Prisma.InputJsonValue,
          topDrivers: variant.topDrivers as unknown as Prisma.InputJsonValue,
          features: variant.features as Prisma.InputJsonValue,
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
      (best, variant) => (variant.totalScore > best.totalScore ? variant : best),
      ev.variants[0],
    );

    return {
      id: ev.id,
      createdAt: ev.createdAt,
      goal: ev.goal,
      topScore: top?.totalScore ?? null,
      topUrl: top?.url ?? null,
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
