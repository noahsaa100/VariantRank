import { canUseAiAssist, AI_ASSIST_MODEL, AI_ASSIST_TIMEOUT_MS, OPENAI_API_BASE_URL } from '../config/aiAssist';
import type { GoalKey } from '../config/goals';
import type { AiActionType, AiCommitmentLevel, CtaClassificationAssist } from '../types/aiAssist';

const VALID_GOAL_KEYS = new Set<GoalKey>([
  'leadGeneration',
  'trialSignup',
  'directPurchase',
  'bookingConsultation',
  'contentEngagement',
]);

const VALID_ACTION_TYPES = new Set<AiActionType>(['action', 'informational', 'mixed', 'unknown']);
const VALID_COMMITMENT_LEVELS = new Set<AiCommitmentLevel>(['low', 'medium', 'high', 'unknown']);

interface OpenAiChatChoice {
  message?: {
    content?: string;
  };
}

interface OpenAiChatResponse {
  choices?: OpenAiChatChoice[];
}

function toSafeConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function requestAiJson(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown> | null> {
  if (!canUseAiAssist()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_ASSIST_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENAI_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_ASSIST_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseJsonObject(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
