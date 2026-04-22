import { Prisma, PrismaClient } from '@prisma/client';
import {
  CATEGORY_CONCEPT_MAP,
  CONCEPT_LABELS,
  DOMINANT_CATEGORY_BY_CONCEPT,
  TOP_LEVEL_CATEGORIES,
  type BehaviouralConcept,
  type TopLevelCategory,
} from '../config/behaviouralScoring';
import { GOAL_WEIGHT_MATRICES } from '../config/goalWeightMatrices';
import { GOAL_LABELS, type GoalKey } from '../config/goals';
import type { CtaClassificationAssist, GoalMappingAssist } from '../types/aiAssist';
import { classifyPrimaryCtaWithAi } from './aiAssistService';
import {
  createFallbackFeatures,
  extractFeaturesFromHtml,
  type CommitmentLevel,
  type CtaAnalysis,
  type ExtractedFeatures,
} from './htmlFeatureExtractor';
import { fetchPageHtml } from './pageFetcher';
import { resolveGoalWithAssist } from './goalAssistService';

const prisma = new PrismaClient();

type CategoryScores = Record<TopLevelCategory, number>;
type BehaviouralScores = Record<BehaviouralConcept, number>;

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

const ALL_CONCEPTS = Object.keys(CONCEPT_LABELS) as BehaviouralConcept[];

function withAssistMetadata(
  features: ExtractedFeatures,
  goalAssist: GoalMappingAssist,
  ctaAssist: CtaClassificationAssist | null,
): ExtractedFeatures {
  return {
    ...features,
    aiAssist: {
      goalMapping: goalAssist,
      ...(ctaAssist ? { ctaClassification: ctaAssist } : {}),
    },
  };
}

function toScore(value: number): number {
  return Math.max(0, Math.min(100, parseFloat(value.toFixed(1))));
}

function getContentDepthScore(wordCount: number): number {
  if (wordCount >= 1200) return 100;
  if (wordCount >= 600) return 85;
  if (wordCount >= 250) return 70;
  if (wordCount >= 120) return 55;
  if (wordCount >= 60) return 40;
  if (wordCount > 0) return 25;
  return 0;
}

function getCommitmentBoost(level: CommitmentLevel): number {
  if (level === 'medium') return 12;
  if (level === 'high') return 9;
  if (level === 'low') return 5;
  return 0;
}

function getGoalSpecificCommitmentAdjustment(goalKey: GoalKey, level: CommitmentLevel): number {
  if (goalKey === 'directPurchase') {
    if (level === 'high') return 8;
    if (level === 'medium') return 4;
    if (level === 'low') return -4;
  }

  if (goalKey === 'contentEngagement') {
    if (level === 'low') return 6;
    if (level === 'medium') return 2;
    if (level === 'high') return -5;
  }

  if (level === 'high') return -3;
  if (level === 'medium') return 4;
  if (level === 'low') return 2;
  return 0;
}

function deriveBehaviouralScores(features: ExtractedFeatures, goalKey: GoalKey): BehaviouralScores {
  if (features.analysisError) {
    return {
      messageClarity: 8,
      valueCommunication: 8,
      actionOrientation: 8,
      formEfficiency: 8,
      navigationOrientation: 8,
      credibilitySignals: 8,
      supportConfidence: 8,
      technicalReadiness: 8,
      contentDepth: 8,
    };
  }

  const cta = features.ctaAnalysis as CtaAnalysis;
  const ctaDiversity = cta.actionCtaCount + cta.mixedCtaCount + cta.informationalCtaCount;
  const riskCueCount = cta.riskReductionCues.length;
  const effortCueCount = cta.effortCues.length;
  const responsibilityCueCount = cta.responsibilityCues.length;
  const primaryVerbPresent = Boolean(cta.primaryVerb);
  const primaryType = cta.primaryCtaType;
  const commitmentLevel = cta.primaryCommitmentLevel;

  // Synthesises verb presence, CTA type, and commitment into a single 0–100 clarity signal.
  // Scaled by 0.6 in actionOrientation (range 12–54), replacing the old fragmented
  // primaryCtaText-presence + primaryType-branch contributions.
  const ctaClarityScore: number = (() => {
    if (!primaryVerbPresent) return 20;                  // no verb → very low clarity
    if (primaryType === 'action') return 90;             // action verb + action type → high clarity
    if (primaryType === 'mixed') return 60;              // verb but mixed intent → medium clarity
    if (primaryType === 'informational') return 30;      // verb present but informational → low clarity
    return 20;                                           // unknown type → very low clarity
  })();

  const messageClarity = toScore(
    (features.titlePresent ? 20 : 0) +
    (features.metaDescriptionPresent ? 15 : 0) +
    (features.h1Count === 1 ? 25 : features.h1Count > 1 ? 15 : 0) +
    Math.min(features.headingCount, 6) * 6 +
    (features.wordCount >= 120 ? 20 : features.wordCount >= 60 ? 10 : 0) +
    (primaryVerbPresent ? 8 : 0),
  );

  const valueCommunication = toScore(
    (features.primaryCtaText ? 18 : 0) +
    Math.min(ctaDiversity, 4) * 9 +
    (primaryVerbPresent ? 12 : 0) +
    (primaryType === 'action' ? 12 : primaryType === 'mixed' ? 8 : primaryType === 'informational' ? 5 : 0) +
    Math.min(riskCueCount, 3) * 8 +
    Math.min(responsibilityCueCount, 2) * 4 +
    (features.wordCount >= 80 ? 15 : 0) +
    (features.testimonialKeywordsPresent ? 10 : 0) +
    (features.faqKeywordsPresent ? 8 : 0) +
    (features.formPresent ? 8 : 0),
  );

  // Ordered by severity; short-circuits so only the most impactful adjustment fires per variant.
  // Keeps actionOrientation low when there is no usable action signal, and high when intent is clear.
  const ctaSignalAdjustment: number = (() => {
    if (features.ctaCount === 0) return -20;                                          // no CTA → strong suppression
    if (!primaryVerbPresent) return -10;                                              // CTA present but intent unreadable
    if (primaryType === 'informational') return -8;                                   // explicitly non-conversion type
    if (cta.mixedCtaCount > 0 && cta.actionCtaCount === 0) return -5;               // only mixed CTAs, no clear action
    return 0;                                                                         // clear action CTA — no deduction
  })();

  const actionOrientation = toScore(
    Math.min(cta.actionCtaCount + cta.mixedCtaCount, 5) * 12 +
    Math.min(cta.informationalCtaCount, 3) * 5 +
    Math.round(ctaClarityScore * 0.6) +
    ctaSignalAdjustment +
    getCommitmentBoost(commitmentLevel) +
    getGoalSpecificCommitmentAdjustment(goalKey, commitmentLevel) +
    Math.min(riskCueCount, 2) * 5 +
    Math.min(responsibilityCueCount, 2) * 3 +
    (features.formPresent ? 20 : 10) +
    (features.formPresent
      ? features.formFieldCount <= 6
        ? 15
        : features.formFieldCount <= 10
          ? 8
          : 2
      : 10),
  );

  const formEfficiencyBase = !features.formPresent
    ? 70
    : features.formFieldCount <= 4
      ? 95
      : features.formFieldCount <= 8
        ? 80
        : features.formFieldCount <= 12
          ? 60
          : features.formFieldCount <= 18
            ? 40
            : 20;

  const formEfficiency = toScore(
    formEfficiencyBase +
    (features.ctaCount > 0 ? 10 : 0) +
    (features.navLinkCount > 0 ? 5 : 0) +
    (riskCueCount > 0 ? 5 : 0) +
    (effortCueCount >= 3 ? -12 : effortCueCount === 2 ? -6 : effortCueCount === 1 ? -3 : 0),
  );

  const navigationOrientation = toScore(
    (features.navLinkCount === 0 ? 20 : features.navLinkCount <= 3 ? 55 : features.navLinkCount <= 10 ? 85 : 70) +
    (features.headingCount >= 3 ? 10 : features.headingCount > 0 ? 5 : 0) +
    (features.h1Count === 1 ? 5 : 0),
  );

  const credibilitySignals = toScore(
    (features.httpsPresent ? 25 : 0) +
    (features.testimonialKeywordsPresent ? 20 : 0) +
    (features.contactInfoPresent ? 20 : 0) +
    (features.faqKeywordsPresent ? 10 : 0) +
    (features.titlePresent ? 10 : 0) +
    (features.metaDescriptionPresent ? 10 : 0) +
    (features.formPresent ? 5 : 0) +
    Math.min(riskCueCount, 3) * 4,
  );

  const supportConfidence = toScore(
    (features.contactInfoPresent ? 35 : 0) +
    (features.faqKeywordsPresent ? 25 : 0) +
    (features.formPresent ? 15 : 0) +
    (features.navLinkCount > 0 ? 10 : 0) +
    (features.wordCount >= 120 ? 10 : 0) +
    (features.testimonialKeywordsPresent ? 5 : 0),
  );

  const technicalReadiness = toScore(
    (features.httpsPresent ? 25 : 0) +
    (features.viewportMetaPresent ? 25 : 0) +
    (features.titlePresent ? 10 : 0) +
    (features.metaDescriptionPresent ? 10 : 0) +
    (features.headingCount > 0 ? 10 : 0) +
    (features.wordCount >= 50 ? 10 : 0) +
    (features.formPresent ? 5 : 0) +
    (features.ctaCount > 0 ? 5 : 0),
  );

  const contentDepth = toScore(
    getContentDepthScore(features.wordCount) +
    (features.headingCount >= 4 ? 10 : features.headingCount >= 2 ? 5 : 0) +
    (features.h1Count === 1 ? 5 : 0),
  );

  return {
    messageClarity,
    valueCommunication,
    actionOrientation,
    formEfficiency,
    navigationOrientation,
    credibilitySignals,
    supportConfidence,
    technicalReadiness,
    contentDepth,
  };
}

function applyGoalMultipliers(baseScores: BehaviouralScores, goalKey: GoalKey): BehaviouralScores {
  const multipliers = GOAL_WEIGHT_MATRICES[goalKey].conceptMultipliers;

  return ALL_CONCEPTS.reduce((acc, concept) => {
    acc[concept] = toScore(baseScores[concept] * multipliers[concept]);
    return acc;
  }, {} as BehaviouralScores);
}

function deriveCategoryScores(conceptScores: BehaviouralScores): CategoryScores {
  return TOP_LEVEL_CATEGORIES.reduce((acc, category) => {
    const map = CATEGORY_CONCEPT_MAP[category];
    let total = 0;

    for (const concept of ALL_CONCEPTS) {
      const weight = map[concept] ?? 0;
      if (weight > 0) {
        total += conceptScores[concept] * weight;
      }
    }

    acc[category] = toScore(total);
    return acc;
  }, {} as CategoryScores);
}

function computeTotalScore(categoryScores: CategoryScores, goalKey: GoalKey): number {
  const weights = GOAL_WEIGHT_MATRICES[goalKey].categoryWeights;
  const total = TOP_LEVEL_CATEGORIES.reduce(
    (sum, category) => sum + categoryScores[category] * weights[category],
    0,
  );

  return parseFloat(total.toFixed(2));
}

function deriveRulePenalties(
  features: ExtractedFeatures,
  conceptScores: BehaviouralScores,
  goalKey: GoalKey,
): RulePenalty[] {
  if (features.analysisError) {
    return [
      {
        rule: `Technical fallback: Page fetch failed (${features.analysisError})`,
        penalty: -35,
      },
    ];
  }

  const penalties: RulePenalty[] = [];
  const cta = features.ctaAnalysis as CtaAnalysis;
  const hasActionIntent = cta.actionCtaCount + cta.mixedCtaCount > 0;
  const hasRiskReduction = cta.riskReductionCues.length > 0;

  // Placed first to guarantee it survives the slice(0, 8) truncation.
  if (features.ctaCount === 0) penalties.push({ rule: 'UX/Friction risk: No clear CTA detected', penalty: -18 });

  if (!features.httpsPresent) penalties.push({ rule: 'Trust/Technical risk: Missing HTTPS', penalty: -10 });
  if (!features.titlePresent) penalties.push({ rule: 'Clarity risk: Missing page title', penalty: -6 });
  if (!features.metaDescriptionPresent) penalties.push({ rule: 'Clarity risk: Missing meta description', penalty: -4 });
  if (!features.viewportMetaPresent) penalties.push({ rule: 'UX/Technical risk: Missing viewport meta', penalty: -5 });
  if (features.ctaCount > 0 && !cta.primaryVerb) {
    penalties.push({ rule: 'Clarity risk: Primary CTA lacks a clear action verb', penalty: -5 });
  }
  if (features.ctaCount > 0 && !hasActionIntent) {
    penalties.push({ rule: 'UX risk: CTA set is mostly informational, not action-oriented', penalty: -7 });
  }

  // CTA ambiguity group — only fires when CTAs are present to avoid overlap with the no-CTA penalty.
  // if/else-if ensures exactly one tier fires per evaluation, preventing internal double-counting.
  if (features.ctaCount > 0) {
    const isInformational = cta.primaryCtaType === 'informational';
    const verbMissing = !cta.primaryVerb;
    const hasMixed = cta.mixedCtaCount > 0;

    if (isInformational || verbMissing) {
      // High ambiguity: primary CTA type points away from conversion, or intent cannot be inferred from verb
      penalties.push({ rule: 'Clarity/UX risk: CTA intent is ambiguous or non-action-oriented', penalty: -12 });
    } else if (hasMixed) {
      // Moderate ambiguity: mixed CTA signals present alongside action CTAs, may dilute focus
      penalties.push({ rule: 'UX risk: Mixed CTA signals may dilute primary conversion intent', penalty: -6 });
    }
  }

  if (features.ctaCount > 4) {
    penalties.push({ rule: 'UX risk: High CTA count may cause choice overload', penalty: -4 });
  }
  if (features.formPresent && features.formFieldCount > 12) {
    penalties.push({ rule: 'Friction risk: Form appears long/high-effort', penalty: -8 });
  }
  if (cta.effortCues.length >= 3) {
    penalties.push({ rule: 'Friction risk: CTA phrasing suggests high user effort', penalty: -6 });
  }
  if (!features.contactInfoPresent) penalties.push({ rule: 'Trust risk: No visible contact info', penalty: -7 });
  if (!features.testimonialKeywordsPresent) penalties.push({ rule: 'Trust risk: No social-proof language', penalty: -5 });
  if (features.wordCount < 80) penalties.push({ rule: 'Clarity risk: Very low page copy', penalty: -7 });

  if (
    (goalKey === 'leadGeneration' || goalKey === 'trialSignup' || goalKey === 'bookingConsultation') &&
    cta.primaryCommitmentLevel === 'high'
  ) {
    penalties.push({ rule: 'Goal-fit risk: CTA commitment is too high for early-stage conversion goal', penalty: -6 });
  }
  if (goalKey === 'directPurchase' && cta.primaryCommitmentLevel === 'low') {
    penalties.push({ rule: 'Goal-fit risk: CTA commitment is too low for purchase intent', penalty: -6 });
  }
  if (goalKey === 'contentEngagement' && hasActionIntent && cta.primaryCommitmentLevel === 'high') {
    penalties.push({ rule: 'Goal-fit risk: High-commitment CTA may suppress content engagement intent', penalty: -5 });
  }
  if (
    (goalKey === 'trialSignup' || goalKey === 'directPurchase') &&
    hasActionIntent &&
    !hasRiskReduction
  ) {
    penalties.push({ rule: 'Trust/UX risk: Action CTA lacks risk-reduction cue (free, trial, demo, guarantee)', penalty: -5 });
  }

  const multipliers = GOAL_WEIGHT_MATRICES[goalKey].conceptMultipliers;
  const priorityConcepts = [...ALL_CONCEPTS]
    .sort((a, b) => multipliers[b] - multipliers[a])
    .filter((concept) => multipliers[concept] > 1.1)
    .slice(0, 3);

  for (const concept of priorityConcepts) {
    const score = conceptScores[concept];
    if (score >= 50) continue;
    const penaltyMagnitude = Math.min(10, Math.max(4, Math.round((50 - score) / 5)));
    penalties.push({
      rule: `Goal-fit risk (${GOAL_LABELS[goalKey]}): Weak ${CONCEPT_LABELS[concept]}`,
      penalty: -penaltyMagnitude,
    });
  }

  return penalties.slice(0, 8);
}

function buildConceptDriver(
  concept: BehaviouralConcept,
  score: number,
  features: ExtractedFeatures,
): string {
  const category = DOMINANT_CATEGORY_BY_CONCEPT[concept];
  const cta = features.ctaAnalysis as CtaAnalysis;

  switch (concept) {
    case 'actionOrientation':
      if (features.primaryCtaText) {
        const verb = cta.primaryVerb ? `verb "${cta.primaryVerb}"` : 'no explicit verb';
        return `${category}: CTA "${features.primaryCtaText}" uses ${verb} (${cta.primaryCommitmentLevel} commitment, ${score.toFixed(0)})`;
      }
      return `${category}: Action orientation signal is strong (${score.toFixed(0)})`;
    case 'formEfficiency':
      if (features.formPresent) {
        return `${category}: Form efficiency is healthy (${features.formFieldCount} fields, ${score.toFixed(0)})`;
      }
      return `${category}: Low-friction path detected (no form gate, ${score.toFixed(0)})`;
    case 'contentDepth':
      return `${category}: Content depth is solid (${features.wordCount} words, ${score.toFixed(0)})`;
    default:
      return `${category}: Strong ${CONCEPT_LABELS[concept]} (${score.toFixed(0)})`;
  }
}

function deriveTopDrivers(
  features: ExtractedFeatures,
  conceptScores: BehaviouralScores,
  goalKey: GoalKey,
): string[] {
  if (features.analysisError) {
    return [
      `Fallback analysis used due to fetch failure: ${features.analysisError}`,
      `Goal impact (${GOAL_LABELS[goalKey]}): heavy trust/technical penalty applied`,
    ];
  }

  const multipliers = GOAL_WEIGHT_MATRICES[goalKey].conceptMultipliers;
  const prioritizedConcept = [...ALL_CONCEPTS].sort((a, b) => multipliers[b] - multipliers[a])[0];
  const drivers: string[] = [];
  const cta = features.ctaAnalysis as CtaAnalysis;
  const aiCta = features.aiAssist?.ctaClassification;

  if (conceptScores[prioritizedConcept] >= 60) {
    drivers.push(
      `Goal fit (${GOAL_LABELS[goalKey]}): ${CONCEPT_LABELS[prioritizedConcept]} is strong (${conceptScores[prioritizedConcept].toFixed(0)})`,
    );
  }

  if (cta.primaryVerb && features.primaryCtaText) {
    drivers.push(
      `CTA quality: "${features.primaryCtaText}" uses action verb "${cta.primaryVerb}" with ${cta.primaryCommitmentLevel} commitment`,
    );
  }
  if (cta.riskReductionCues.length > 0) {
    drivers.push(`CTA reassurance: risk-reduction cues detected (${cta.riskReductionCues.join(', ')})`);
  }
  if (cta.actionCtaCount + cta.mixedCtaCount >= 2) {
    drivers.push(`CTA coverage: ${cta.actionCtaCount + cta.mixedCtaCount} action-oriented CTA options detected`);
  }
  if (aiCta) {
    drivers.push(
      `AI assist: CTA classified as ${aiCta.actionType} / ${aiCta.commitmentLevel} commitment (confidence ${Math.round(aiCta.confidence * 100)}%)`,
    );
  }

  const rankedConcepts = [...ALL_CONCEPTS].sort((a, b) => conceptScores[b] - conceptScores[a]);
  for (const concept of rankedConcepts) {
    if (drivers.length >= 4) break;
    if (conceptScores[concept] < 60) continue;
    const message = buildConceptDriver(concept, conceptScores[concept], features);
    if (!drivers.includes(message)) {
      drivers.push(message);
    }
  }

  if (drivers.length === 0) {
    drivers.push('Baseline behavioural signals detected but no strong conversion drivers.');
  }

  return drivers.slice(0, 4);
}

async function analyzeVariant(
  url: string,
  index: number,
  goalKey: GoalKey,
  goalAssist: GoalMappingAssist,
): Promise<VariantComputation> {
  try {
    const fetchResult = await fetchPageHtml(url);
    const extracted = fetchResult.ok
      ? extractFeaturesFromHtml(fetchResult.html, fetchResult.finalUrl)
      : createFallbackFeatures(fetchResult.finalUrl || url, fetchResult.error);
    const aiCta = extracted.primaryCtaText
      ? await classifyPrimaryCtaWithAi(extracted.primaryCtaText, goalKey)
      : null;
    const features = withAssistMetadata(extracted, goalAssist, aiCta);

    const baseConceptScores = deriveBehaviouralScores(features, goalKey);
    const goalAdjustedConceptScores = applyGoalMultipliers(baseConceptScores, goalKey);
    const categoryScores = deriveCategoryScores(goalAdjustedConceptScores);

    return {
      index,
      url,
      totalScore: computeTotalScore(categoryScores, goalKey),
      categoryScores,
      rulePenalties: deriveRulePenalties(features, goalAdjustedConceptScores, goalKey),
      topDrivers: deriveTopDrivers(features, goalAdjustedConceptScores, goalKey),
      features,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected analysis error';
    const fallback = createFallbackFeatures(url, message);
    const features = withAssistMetadata(fallback, goalAssist, null);
    const baseConceptScores = deriveBehaviouralScores(features, goalKey);
    const goalAdjustedConceptScores = applyGoalMultipliers(baseConceptScores, goalKey);
    const categoryScores = deriveCategoryScores(goalAdjustedConceptScores);

    return {
      index,
      url,
      totalScore: computeTotalScore(categoryScores, goalKey),
      categoryScores,
      rulePenalties: deriveRulePenalties(features, goalAdjustedConceptScores, goalKey),
      topDrivers: deriveTopDrivers(features, goalAdjustedConceptScores, goalKey),
      features,
    };
  }
}

export interface CreateEvaluationInput {
  urls: string[];
  goal: string;
  goalDescription?: string;
  anonymousSessionId?: string;
}

export async function createEvaluation(input: CreateEvaluationInput) {
  const { urls, goal, goalDescription, anonymousSessionId } = input;
  const { scoringGoalKey, goalAssist } = await resolveGoalWithAssist(goal, goalDescription);
  const goalKey = scoringGoalKey;
  const start = Date.now();

  const variantData = await Promise.all(urls.map((url, index) => analyzeVariant(url, index, goalKey, goalAssist)));

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

export async function deleteEvaluation(id: string): Promise<boolean> {
  const existing = await prisma.evaluation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return false;
  }

  await prisma.$transaction([
    prisma.variant.deleteMany({ where: { evaluationId: id } }),
    prisma.evaluation.delete({ where: { id } }),
  ]);

  return true;
}

export async function deleteAllEvaluations() {
  const deletedVariants = await prisma.variant.deleteMany();
  const deletedEvaluations = await prisma.evaluation.deleteMany();

  return {
    deletedEvaluations: deletedEvaluations.count,
    deletedVariants: deletedVariants.count,
  };
}
