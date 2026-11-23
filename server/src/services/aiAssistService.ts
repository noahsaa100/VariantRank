import { AsyncLocalStorage } from 'node:async_hooks';
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
  name?: string;
  input?: unknown;
}

interface AnthropicMessageResponse {
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface AiUsageTracker {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

const aiUsageStorage = new AsyncLocalStorage<AiUsageTracker>();

export function createAiUsageTracker(): AiUsageTracker {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
}

export function withAiUsageTracking<T>(tracker: AiUsageTracker, callback: () => Promise<T>): Promise<T> {
  return aiUsageStorage.run(tracker, callback);
}

export function summarizeAiUsage(tracker: AiUsageTracker) {
  // Claude Haiku 5.5 rates for prompts below 100K tokens, in USD per million tokens.
  const estimatedCostUsd = (
    tracker.inputTokens * 0.10
    + tracker.outputTokens * 0.50
    + tracker.cacheWriteTokens * 0.125
    + tracker.cacheReadTokens * 0.01
  ) / 1_000_000;
  return {
    model: AI_ASSIST_MODEL,
    requestCount: tracker.requestCount,
    inputTokens: tracker.inputTokens,
    outputTokens: tracker.outputTokens,
    cacheWriteTokens: tracker.cacheWriteTokens,
    cacheReadTokens: tracker.cacheReadTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
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
    // Recover JSON embedded in a text response.
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

async function requestAiJson(
  systemPrompt: string,
  userPrompt: AnthropicUserContent,
  options: { timeoutMs?: number; maxTokens?: number; inputSchema?: Record<string, unknown> } = {},
): Promise<Record<string, unknown> | null> {
  if (!canUseAiAssist()) {
    return null;
  }

  const activeTracker = aiUsageStorage.getStore();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_ASSIST_TIMEOUT_MS);

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
        max_tokens: options.maxTokens ?? AI_ASSIST_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [{
          name: 'return_json',
          description: 'Return the requested structured JSON result.',
          input_schema: options.inputSchema ?? { type: 'object', additionalProperties: true },
        }],
        tool_choice: { type: 'tool', name: 'return_json' },
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.warn(`Anthropic request failed (${res.status}): ${errorBody.slice(0, 300)}`);
      return null;
    }

    const data = (await res.json()) as AnthropicMessageResponse;
    if (activeTracker) {
      activeTracker.requestCount += 1;
      activeTracker.inputTokens += data.usage?.input_tokens ?? 0;
      activeTracker.outputTokens += data.usage?.output_tokens ?? 0;
      activeTracker.cacheWriteTokens += data.usage?.cache_creation_input_tokens ?? 0;
      activeTracker.cacheReadTokens += data.usage?.cache_read_input_tokens ?? 0;
    }
    const toolResult = data.content?.find((block) =>
      block.type === 'tool_use'
      && block.name === 'return_json'
      && block.input
      && typeof block.input === 'object'
      && !Array.isArray(block.input));
    if (toolResult?.input && typeof toolResult.input === 'object' && !Array.isArray(toolResult.input)) {
      return toolResult.input as Record<string, unknown>;
    }
    // Fallback for models that ignore tool choice.
    const content = data.content
      ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (!content) return null;
    const parsed = parseJsonObject(content);
    if (!parsed) console.warn(`Anthropic returned non-JSON content: ${content.slice(0, 240)}`);
    return parsed;
  } catch (error) {
    console.warn('Anthropic request failed before a valid response:', error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface AiCriterionInput {
  id: string;
  description: string;
  rationale: string | null;
  statusDefinitions?: unknown;
  evidenceNeeded?: unknown;
  subchecks?: unknown;
}

export interface AiCriterionVerdict {
  criterionId: string;
  status: 'GOOD' | 'CAN_BE_IMPROVED' | 'BAD' | 'NOT_RELEVANT' | 'NEEDS_REVIEW';
  evidence: string;
  confidence: number;
  subcheckResults?: Array<{
    label: string;
    status: 'SATISFIED' | 'MISSING' | 'NOT_APPLICABLE' | 'NOT_OBSERVED';
    evidence: string;
  }>;
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

export interface ComparisonSynthesis {
  narrative: string;
  storeInsights: Array<{ url: string; strengths: string[]; improvements: string[] }>;
}

export interface StructuredBestPracticeDefinition {
  sourceIndex: number;
  title: string;
  description: string;
  rationale: string | null;
  pageAreas: string[];
  category: 'SHOPPING_UX' | 'TRUST_CONFIDENCE' | 'OFFER_CLARITY' | 'PURCHASE_EASE' | 'TECHNICAL_ACCESSIBILITY';
  evaluationMethod: 'AUTOMATED' | 'AI_ASSISTED' | 'HYBRID' | 'MANUAL';
  evidenceSource: 'PAGE' | 'SHOPPING_JOURNEY' | 'EXTERNAL_BUSINESS_DATA' | 'HUMAN_REVIEW';
  good: string;
  canBeImproved: string;
  bad: string;
  notApplicable: string;
  evidenceNeeded: string[];
  subchecks: Array<{ label: string; evidenceNeeded: string }>;
  confidence: number;
}

/**
 * Converts loosely written checklist items into proposed, reviewable scoring
 * definitions. It never publishes or activates them.
 */
export async function structureBestPracticeChecklistWithAi(items: Array<{
  sourceIndex: number;
  section: string;
  text: string;
}>): Promise<StructuredBestPracticeDefinition[]> {
  if (items.length === 0 || !canUseAiAssist()) return [];
  const definitions: StructuredBestPracticeDefinition[] = [];
  const batchSize = 4;
  const batches = Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) =>
    items.slice(index * batchSize, (index + 1) * batchSize));
  let nextBatch = 0;
  const processBatch = async (batch: typeof items) => {
    const requestBatch = async (pending: typeof batch) => requestAiJson(
      `You structure ecommerce and UX best-practice checklist items for VariantRank.
Return raw JSON only as {"criteria":[...]}, with no Markdown fences. Return exactly one item for every supplied sourceIndex and never invent extra checks. Keep title under 120 characters, description and rationale under 320 characters, each rubric under 240 characters, and include at most 6 directly relevant subchecks.
Each criterion must contain: sourceIndex, title, description, rationale (string or null), pageAreas (array using HOME, COLLECTION, PRODUCT, CART, CHECKOUT, SEARCH, SITE_WIDE or OTHER), category (SHOPPING_UX, TRUST_CONFIDENCE, OFFER_CLARITY, PURCHASE_EASE or TECHNICAL_ACCESSIBILITY), evaluationMethod (AUTOMATED, AI_ASSISTED, HYBRID or MANUAL), evidenceSource (PAGE, SHOPPING_JOURNEY, EXTERNAL_BUSINESS_DATA or HUMAN_REVIEW), good, canBeImproved, bad, notApplicable, evidenceNeeded (string array), subchecks (array of {label,evidenceNeeded}), confidence (0..1).
Use the numbered heading as the criterion and its following explanation, bullets and examples as supporting rationale and measurement guidance. Do not turn supporting bullets into unrelated extra criteria.
Include each directly relevant source bullet as a separate measurable subcheck. Exclude bullets belonging to an adjacent question or merely repeating the rationale. The parent rubric is exact: GOOD when every applicable observable subcheck is satisfied; CAN_BE_IMPROVED when at least one is satisfied and at least one is missing; BAD when applicable subchecks were observable but none were satisfied; NOT_APPLICABLE when none apply. Checks requiring CRM, email, fulfilment or other private operational evidence must use evidenceSource EXTERNAL_BUSINESS_DATA and evaluationMethod MANUAL so storefront scans exclude them.
Make each status operational and observable. Do not claim evidence exists; define what an evaluator should look for. Preserve the source meaning and avoid adding arbitrary numeric thresholds unless the source supplies them or a widely established technical minimum is explicit.`,
      JSON.stringify({ items: pending }),
      { timeoutMs: Math.max(AI_ASSIST_TIMEOUT_MS, 90_000), maxTokens: Math.max(AI_ASSIST_MAX_TOKENS, 8_000) },
    );
    let pending = batch;
    for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
      const response = await requestBatch(pending);
      const criteria = Array.isArray(response?.criteria) ? response.criteria : [];
      const received = new Set<number>();
      for (const value of criteria) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      const sourceIndex = Number(item.sourceIndex);
      const source = pending.find((candidate) => candidate.sourceIndex === sourceIndex);
      if (!source) continue;
      received.add(sourceIndex);
      const category = String(item.category);
      const evaluationMethod = String(item.evaluationMethod);
      const stringValue = (key: string, fallback: string) => typeof item[key] === 'string' && item[key].trim()
        ? item[key].trim()
        : fallback;
      definitions.push({
        sourceIndex,
        title: stringValue('title', source.text.slice(0, 140)),
        description: stringValue('description', source.text),
        rationale: typeof item.rationale === 'string' && item.rationale.trim() ? item.rationale.trim() : null,
        pageAreas: Array.isArray(item.pageAreas) ? item.pageAreas.filter((entry): entry is string => typeof entry === 'string') : [],
        category: ['SHOPPING_UX', 'TRUST_CONFIDENCE', 'OFFER_CLARITY', 'PURCHASE_EASE', 'TECHNICAL_ACCESSIBILITY'].includes(category)
          ? category as StructuredBestPracticeDefinition['category'] : 'SHOPPING_UX',
        evaluationMethod: ['AUTOMATED', 'AI_ASSISTED', 'HYBRID', 'MANUAL'].includes(evaluationMethod)
          ? evaluationMethod as StructuredBestPracticeDefinition['evaluationMethod'] : 'HYBRID',
        evidenceSource: ['PAGE', 'SHOPPING_JOURNEY', 'EXTERNAL_BUSINESS_DATA', 'HUMAN_REVIEW'].includes(String(item.evidenceSource))
          ? String(item.evidenceSource) as StructuredBestPracticeDefinition['evidenceSource']
          : 'PAGE',
        good: stringValue('good', `The page clearly satisfies: ${source.text}`),
        canBeImproved: stringValue('canBeImproved', `The page partially satisfies the check but the implementation is unclear or incomplete.`),
        bad: stringValue('bad', `The page does not satisfy: ${source.text}`),
        notApplicable: stringValue('notApplicable', 'The check does not apply to this page type or customer journey.'),
        evidenceNeeded: Array.isArray(item.evidenceNeeded)
          ? item.evidenceNeeded.filter((entry): entry is string => typeof entry === 'string')
          : [],
        subchecks: Array.isArray(item.subchecks) ? item.subchecks.flatMap((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
          const subcheck = entry as Record<string, unknown>;
          if (typeof subcheck.label !== 'string' || !subcheck.label.trim()) return [];
          return [{
            label: subcheck.label.trim().slice(0, 240),
            evidenceNeeded: typeof subcheck.evidenceNeeded === 'string'
              ? subcheck.evidenceNeeded.trim().slice(0, 500)
              : subcheck.label.trim().slice(0, 240),
          }];
        }) : [],
        confidence: toSafeConfidence(item.confidence, 0.65),
      });
      }
      pending = pending.filter((item) => !received.has(item.sourceIndex));
    }
  };
  const worker = async () => {
    while (nextBatch < batches.length) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      await processBatch(batches[batchIndex]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, batches.length) }, () => worker()));
  return definitions.sort((left, right) => left.sourceIndex - right.sourceIndex);
}

export async function generateComparisonNarrativeWithAi(input: {
  stores: Array<{
    url: string;
    score: number;
    categoryScores: Record<string, number>;
    strengths: string[];
    weaknesses: string[];
    placementEvidence: string[];
  }>;
}): Promise<ComparisonSynthesis | null> {
  if (input.stores.length === 0) return null;
  const systemPrompt = `
Write a clear ecommerce performance explanation for a non-technical reader. Use only the supplied scores and evidence. Do not repeat audit criteria verbatim, mention Cake, mention AI, or invent facts. For multiple stores, explain why the winner ranked higher, give 2-3 concrete examples, explain why the runner-up remained competitive, and identify one useful improvement. For one store, explain its strongest areas, give 2-3 concrete examples, and identify one useful improvement. When placementEvidence explicitly identifies where something appeared, naturally state that location; never infer placement from ordinary evidence.
Also rewrite each store's evidence as up to 4 concise strengths and up to 4 concise improvements. Each item must describe what was observed, why it matters, and its verified location when available. Do not expose spreadsheet wording or raw criterion syntax.
Return polished natural language with no ellipses, bullet fragments, raw field names or copied checklist wording. Return JSON only: {"narrative":"3-5 sentence paragraph","storeInsights":[{"url":"exact supplied URL","strengths":["..."],"improvements":["..."]}]}
`;
  const payload = JSON.stringify(input);
  let json: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    json = await requestAiJson(
      attempt === 0 ? systemPrompt : `${systemPrompt}\nRetry ${attempt}: keep the JSON concise and strictly valid.`,
      payload,
      { timeoutMs: 120_000, maxTokens: 4096 },
    );
    if (typeof json?.narrative === 'string' && json.narrative.trim()) break;
  }
  if (typeof json?.narrative !== 'string' || !json.narrative.trim()) return null;
  const insights = Array.isArray(json.storeInsights) ? json.storeInsights.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.url !== 'string') return [];
    return [{
      url: item.url,
      strengths: stringArray(item.strengths, 4),
      improvements: stringArray(item.improvements, 4),
    }];
  }) : [];
  return { narrative: json.narrative.trim().slice(0, 1800), storeInsights: insights };
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
  const json = await requestAiJson(systemPrompt, content, {
    inputSchema: {
      type: 'object',
      required: ['pageType', 'pageSummary', 'sections', 'primaryCta', 'evidence', 'visualIssues', 'confidence'],
      properties: {
        pageType: { type: 'string' },
        pageSummary: { type: 'string' },
        sections: { type: 'array', items: { type: 'string' } },
        primaryCta: {
          type: 'object',
          required: ['text', 'location', 'prominence'],
          properties: {
            text: { type: ['string', 'null'] },
            location: { type: ['string', 'null'] },
            prominence: { type: ['string', 'null'] },
          },
        },
        evidence: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
        visualIssues: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
      },
    },
  });
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
{"results":[{"criterionId":"...","status":"GOOD|CAN_BE_IMPROVED|BAD|NOT_RELEVANT|NEEDS_REVIEW","evidence":"specific evidence, maximum 160 characters","confidence":0-1,"subcheckResults":[{"label":"exact supplied child label","status":"SATISFIED|MISSING|NOT_APPLICABLE|NOT_OBSERVED","evidence":"specific observation"}]}]}
Return exactly one result per supplied criterion. When subchecks are supplied, assess each relevant subcheck and aggregate them using the supplied statusDefinitions; mention satisfied versus missing coverage in the evidence. When statusDefinitions are supplied, classify against those definitions rather than inventing thresholds. Use NEEDS_REVIEW when the evidence cannot support a reliable verdict.
For wording such as "where relevant" or "if offered", first establish relevance from evidence. Use NOT_RELEVANT rather than BAD when relevance is not established. Treat partial positive evidence as CAN_BE_IMPROVED, not BAD. Absence is BAD only when the relevant region or state was captured clearly enough to establish absence.
`;
  const evidence = JSON.stringify({
    pageType: input.pageType,
    visibleText: input.visibleText.slice(0, input.visualInventory ? 2500 : 22000),
    controls: input.controls.slice(0, input.visualInventory ? 30 : 120),
    headings: input.headings.slice(0, input.visualInventory ? 30 : 60),
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
  const json = await requestAiJson(systemPrompt, content, {
    inputSchema: {
      type: 'object',
      required: ['results'],
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            required: ['criterionId', 'status', 'evidence', 'confidence', 'subcheckResults'],
            properties: {
              criterionId: { type: 'string' },
              status: { type: 'string', enum: ['GOOD', 'CAN_BE_IMPROVED', 'BAD', 'NOT_RELEVANT', 'NEEDS_REVIEW'] },
              evidence: { type: 'string' },
              confidence: { type: 'number' },
              subcheckResults: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['label', 'status', 'evidence'],
                  properties: {
                    label: { type: 'string' },
                    status: { type: 'string', enum: ['SATISFIED', 'MISSING', 'NOT_APPLICABLE', 'NOT_OBSERVED'] },
                    evidence: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
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
      subcheckResults: Array.isArray(item.subcheckResults) ? item.subcheckResults.flatMap((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
        const child = entry as Record<string, unknown>;
        const status = String(child.status);
        if (typeof child.label !== 'string' || !['SATISFIED', 'MISSING', 'NOT_APPLICABLE', 'NOT_OBSERVED'].includes(status)) return [];
        return [{
          label: child.label.slice(0, 240),
          status: status as 'SATISFIED' | 'MISSING' | 'NOT_APPLICABLE' | 'NOT_OBSERVED',
          evidence: typeof child.evidence === 'string' ? child.evidence.slice(0, 500) : '',
        }];
      }) : undefined,
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
