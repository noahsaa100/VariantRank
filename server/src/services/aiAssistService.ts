import {
  AI_ASSIST_MAX_TOKENS,
  AI_ASSIST_MODEL,
  AI_ASSIST_TIMEOUT_MS,
  ANTHROPIC_API_BASE_URL,
  canUseAiAssist,
} from '../config/aiAssist';
import type { GoalKey } from '../config/goals';
import type {
  AiActionType,
  AiCommitmentLevel,
  CtaClassificationAssist,
  EcommerceAnalysisAssist,
} from '../types/aiAssist';
import type { EcommerceAiContext } from './htmlFeatureExtractor';

const VALID_GOAL_KEYS = new Set<GoalKey>([
  'leadGeneration',
  'trialSignup',
  'directPurchase',
  'bookingConsultation',
  'contentEngagement',
]);

const VALID_ACTION_TYPES = new Set<AiActionType>(['action', 'informational', 'mixed', 'unknown']);
const VALID_COMMITMENT_LEVELS = new Set<AiCommitmentLevel>(['low', 'medium', 'high', 'unknown']);

interface AnthropicContentBlock {
  type?: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

type AnthropicUserContent = string | Array<{
  type: 'text' | 'image';
  text?: string;
  source?: { type: 'base64'; media_type: 'image/jpeg'; data: string };
}>;

function toSafeConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function toSafeScore(value: unknown, fallback = 50): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Number(value.toFixed(1))));
}

function toEvidence(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 240) : null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // Claude is instructed to return JSON only, but this safely recovers an
    // object if a model wraps it in a short explanatory sentence.
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(normalized.slice(start, end + 1)) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

async function requestAiJson(systemPrompt: string, userPrompt: AnthropicUserContent): Promise<Record<string, unknown> | null> {
  if (!canUseAiAssist()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_ASSIST_TIMEOUT_MS);

  try {
    const res = await fetch(`${ANTHROPIC_API_BASE_URL}/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_ASSIST_MODEL,
        max_tokens: AI_ASSIST_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.warn(`Anthropic request failed (${res.status}): ${errorBody.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as AnthropicMessageResponse;
    const content = data.content
      ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (!content) return null;
    return parseJsonObject(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface AiCriterionInput {
  id: string;
  description: string;
  rationale: string | null;
}

export interface AiCriterionVerdict {
  criterionId: string;
  status: 'GOOD' | 'CAN_BE_IMPROVED' | 'BAD' | 'NOT_RELEVANT' | 'NEEDS_REVIEW';
  evidence: string;
  confidence: number;
}

export interface VisualPageInventory {
  pageType: string;
  pageSummary: string;
  sections: string[];
  primaryCta: { text: string | null; location: string | null; prominence: string | null };
  evidence: Record<string, string[]>;
  visualIssues: string[];
  confidence: number;
}

function stringArray(value: unknown, limit = 12): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 240)).slice(0, limit)
    : [];
}

export async function analyzeVisualPageWithAi(input: {
  pageType: string;
  visibleText: string;
  controls: unknown[];
  signals: unknown;
  desktopScreenshotBase64: string;
  mobileScreenshotBase64: string;
  visualCaptures?: Array<{ label: string; screenshotBase64: string }>;
}): Promise<VisualPageInventory | null> {
  const systemPrompt = `
Create a reusable visual inventory of an ecommerce page from Playwright evidence and screenshots. Record only observable facts. Do not score criteria and do not invent missing content. Return compact JSON only:
{"pageType":"product|collection|cart|checkout|homepage|other","pageSummary":"...","sections":["..."],"primaryCta":{"text":null,"location":null,"prominence":null},"evidence":{"offers":[],"trust":[],"payments":[],"reviews":[],"delivery":[],"returns":[],"guarantees":[],"stock":[],"subscriptions":[],"sizeGuidance":[],"productOptions":[],"navigation":[],"popups":[],"footer":[],"accessibility":[]},"visualIssues":[],"confidence":0-1}
Use short, specific evidence strings and include placement when visible.
`;
  const content: AnthropicUserContent = [
    { type: 'text', text: JSON.stringify({
      pageType: input.pageType,
      visibleText: input.visibleText.slice(0, 26000),
      controls: input.controls.slice(0, 140),
      signals: input.signals,
    }) },
    { type: 'text', text: 'Desktop viewport:' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.desktopScreenshotBase64 } },
    { type: 'text', text: 'Mobile viewport:' },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.mobileScreenshotBase64 } },
  ];
  for (const capture of input.visualCaptures?.slice(0, 4) ?? []) {
    content.push({ type: 'text', text: `${capture.label}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: capture.screenshotBase64 } });
  }
  const json = await requestAiJson(systemPrompt, content);
  if (!json) return null;
  const cta = json.primaryCta && typeof json.primaryCta === 'object' && !Array.isArray(json.primaryCta)
    ? json.primaryCta as Record<string, unknown>
    : {};
  const rawEvidence = json.evidence && typeof json.evidence === 'object' && !Array.isArray(json.evidence)
    ? json.evidence as Record<string, unknown>
    : {};
  const evidence = Object.fromEntries(Object.entries(rawEvidence).map(([key, value]) => [key, stringArray(value)]));
  return {
    pageType: typeof json.pageType === 'string' ? json.pageType : input.pageType,
    pageSummary: typeof json.pageSummary === 'string' ? json.pageSummary.slice(0, 500) : '',
    sections: stringArray(json.sections, 20),
    primaryCta: {
      text: toEvidence(cta.text),
      location: toEvidence(cta.location),
      prominence: toEvidence(cta.prominence),
    },
    evidence,
    visualIssues: stringArray(json.visualIssues, 12),
    confidence: toSafeConfidence(json.confidence, 0.5),
  };
}

export async function evaluateCriteriaWithAi(input: {
  pageType: string;
  visibleText: string;
  controls: unknown[];
  headings: unknown[];
  criteria: AiCriterionInput[];
  desktopScreenshotBase64?: string;
  mobileScreenshotBase64?: string;
  visualCaptures?: Array<{ label: string; screenshotBase64: string }>;
  visualInventory?: VisualPageInventory | null;
}): Promise<AiCriterionVerdict[]> {
  const systemPrompt = `
You evaluate ecommerce best-practice checks using supplied Playwright evidence and a reusable visual inventory. Screenshots may also be supplied for targeted follow-up.
Use only observable evidence. Do not invent. Return compact JSON only:
{"results":[{"criterionId":"...","status":"GOOD|CAN_BE_IMPROVED|BAD|NOT_RELEVANT|NEEDS_REVIEW","evidence":"one specific sentence, maximum 180 characters","confidence":0-1}]}
Return exactly one result per supplied criterion. Use NEEDS_REVIEW when the evidence cannot support a reliable verdict.
For wording such as "where relevant" or "if offered", first establish relevance from evidence. Use NOT_RELEVANT rather than BAD when relevance is not established. Treat partial positive evidence as CAN_BE_IMPROVED, not BAD. Absence is BAD only when the relevant region or state was captured clearly enough to establish absence.
`;
  const evidence = JSON.stringify({
    pageType: input.pageType,
    visibleText: input.visibleText.slice(0, input.visualInventory ? 8000 : 22000),
    controls: input.controls.slice(0, input.visualInventory ? 70 : 120),
    headings: input.headings.slice(0, 60),
    visualInventory: input.visualInventory,
    criteria: input.criteria,
  });
  const content: AnthropicUserContent = [
    { type: 'text', text: evidence },
  ];
  if (input.desktopScreenshotBase64) {
    content.push({ type: 'text', text: 'Desktop viewport:' });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.desktopScreenshotBase64 } });
  }
  if (input.mobileScreenshotBase64) {
    content.push({ type: 'text', text: 'Mobile viewport:' });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.mobileScreenshotBase64 } });
  }
  for (const capture of input.visualCaptures?.slice(0, 4) ?? []) {
    content.push({ type: 'text', text: `${capture.label}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: capture.screenshotBase64 } });
  }
  const json = await requestAiJson(systemPrompt, content);
  const allowed = new Set(['GOOD', 'CAN_BE_IMPROVED', 'BAD', 'NOT_RELEVANT', 'NEEDS_REVIEW']);
  if (!json || !Array.isArray(json.results)) return [];
  return json.results.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.criterionId !== 'string' || typeof item.status !== 'string' || !allowed.has(item.status)) return [];
    return [{
      criterionId: item.criterionId,
      status: item.status as AiCriterionVerdict['status'],
      evidence: typeof item.evidence === 'string' ? item.evidence.slice(0, 500) : 'AI verdict based on rendered page evidence.',
      confidence: toSafeConfidence(item.confidence, 0.5),
    }];
  });
}

export async function mapGoalDescriptionWithAi(goalDescription: string): Promise<{
  mappedGoalKey: GoalKey;
  confidence: number;
  reasoning: string;
} | null> {
  const systemPrompt =
    'You map free-text product goals to one key. Reply JSON only with: mappedGoalKey, confidence, reasoning.';
  const userPrompt = `
Goal description:
${goalDescription}

Allowed mappedGoalKey values:
- leadGeneration
- trialSignup
- directPurchase
- bookingConsultation
- contentEngagement
`;

  const json = await requestAiJson(systemPrompt, userPrompt);
  if (!json) return null;

  const mappedGoalKey = json.mappedGoalKey;
  if (typeof mappedGoalKey !== 'string' || !VALID_GOAL_KEYS.has(mappedGoalKey as GoalKey)) {
    return null;
  }

  return {
    mappedGoalKey: mappedGoalKey as GoalKey,
    confidence: toSafeConfidence(json.confidence, 0.55),
    reasoning: typeof json.reasoning === 'string' ? json.reasoning : 'AI mapped description to nearest supported goal.',
  };
}

export async function classifyPrimaryCtaWithAi(
  primaryCtaText: string,
  goalKey: GoalKey,
): Promise<CtaClassificationAssist | null> {
  if (!primaryCtaText.trim()) {
    return null;
  }

  const systemPrompt =
    'Classify CTA copy. Reply JSON only with: actionType, commitmentLevel, riskReduction, confidence, reasoning.';
  const userPrompt = `
Primary CTA text:
${primaryCtaText}

Goal key context:
${goalKey}

Rules:
- actionType must be one of: action, informational, mixed, unknown
- commitmentLevel must be one of: low, medium, high, unknown
- riskReduction must be object: { "present": boolean, "cues": string[] }
`;

  const json = await requestAiJson(systemPrompt, userPrompt);
  if (!json) return null;

  const actionType = json.actionType;
  const commitmentLevel = json.commitmentLevel;
  const riskReduction = json.riskReduction;

  if (typeof actionType !== 'string' || !VALID_ACTION_TYPES.has(actionType as AiActionType)) {
    return null;
  }
  if (typeof commitmentLevel !== 'string' || !VALID_COMMITMENT_LEVELS.has(commitmentLevel as AiCommitmentLevel)) {
    return null;
  }
  if (!riskReduction || typeof riskReduction !== 'object' || Array.isArray(riskReduction)) {
    return null;
  }

  const rr = riskReduction as { present?: unknown; cues?: unknown };
  const cues = Array.isArray(rr.cues) ? rr.cues.filter((v): v is string => typeof v === 'string').slice(0, 6) : [];

  return {
    primaryCtaText,
    actionType: actionType as AiActionType,
    commitmentLevel: commitmentLevel as AiCommitmentLevel,
    riskReduction: {
      present: Boolean(rr.present),
      cues,
    },
    source: 'ai',
    confidence: toSafeConfidence(json.confidence, 0.55),
    reasoning: typeof json.reasoning === 'string' ? json.reasoning : 'AI classified primary CTA.',
  };
}

export async function analyzeEcommercePageWithAi(
  context: EcommerceAiContext,
): Promise<EcommerceAnalysisAssist | null> {
  const systemPrompt = `
You audit ecommerce product-page evidence. Use only the supplied text and controls; never invent evidence.
Reply JSON only with this shape:
{
  "pageType": "product|collection|cart|other",
  "primaryPurchaseCta": string|null,
  "evidence": {
    "reviews": string|null,
    "offer": string|null,
    "delivery": string|null,
    "returns": string|null,
    "guarantee": string|null,
    "stock": string|null,
    "payment": string|null,
    "subscription": string|null
  },
  "scores": {
    "purchaseClarity": number,
    "purchaseConfidence": number,
    "offerStrength": number,
    "merchandisingQuality": number
  },
  "reasoning": string[],
  "confidence": number
}
Scores are 0-100. Confidence is 0-1. Missing evidence must be null. Focus on purchase support, not general brand copy.
`;
  const userPrompt = JSON.stringify(context);
  const json = await requestAiJson(systemPrompt, userPrompt);
  if (!json) return null;

  const allowedPageTypes = new Set(['product', 'collection', 'cart', 'other']);
  const pageType = typeof json.pageType === 'string' && allowedPageTypes.has(json.pageType)
    ? (json.pageType as EcommerceAnalysisAssist['pageType'])
    : 'other';
  const evidence = json.evidence && typeof json.evidence === 'object' && !Array.isArray(json.evidence)
    ? json.evidence as Record<string, unknown>
    : {};
  const scores = json.scores && typeof json.scores === 'object' && !Array.isArray(json.scores)
    ? json.scores as Record<string, unknown>
    : {};
  const reasoning = Array.isArray(json.reasoning)
    ? json.reasoning.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 300)).slice(0, 6)
    : [];

  return {
    pageType,
    primaryPurchaseCta: toEvidence(json.primaryPurchaseCta),
    evidence: {
      reviews: toEvidence(evidence.reviews),
      offer: toEvidence(evidence.offer),
      delivery: toEvidence(evidence.delivery),
      returns: toEvidence(evidence.returns),
      guarantee: toEvidence(evidence.guarantee),
      stock: toEvidence(evidence.stock),
      payment: toEvidence(evidence.payment),
      subscription: toEvidence(evidence.subscription),
    },
    scores: {
      purchaseClarity: toSafeScore(scores.purchaseClarity),
      purchaseConfidence: toSafeScore(scores.purchaseConfidence),
      offerStrength: toSafeScore(scores.offerStrength),
      merchandisingQuality: toSafeScore(scores.merchandisingQuality),
    },
    reasoning,
    source: 'ai',
    confidence: toSafeConfidence(json.confidence, 0.5),
  };
}
