import { resolveGoalKey, type GoalKey } from '../config/goals';
import type { GoalMappingAssist } from '../types/aiAssist';
import { mapGoalDescriptionWithAi } from './aiAssistService';

type GoalRule = {
  goalKey: GoalKey;
  keywords: string[];
};

const GOAL_RULES: GoalRule[] = [
  {
    goalKey: 'leadGeneration',
    keywords: ['lead', 'inbound', 'contact', 'sales lead', 'qualification', 'pipeline'],
  },
  {
    goalKey: 'trialSignup',
    keywords: ['trial', 'sign up', 'signup', 'start free', 'onboard', 'activation'],
  },
  {
    goalKey: 'directPurchase',
    keywords: ['buy', 'purchase', 'checkout', 'cart', 'order', 'revenue'],
  },
  {
    goalKey: 'bookingConsultation',
    keywords: ['book', 'consult', 'consultation', 'demo call', 'schedule call', 'appointment'],
  },
  {
    goalKey: 'contentEngagement',
    keywords: ['content', 'read', 'engagement', 'newsletter', 'watch', 'learn'],
  },
];

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function mapGoalDescriptionByRules(goalDescription: string): GoalMappingAssist | null {
  const description = normalize(goalDescription);
  if (!description) return null;

  // Lightweight fallback mapping when AI is unavailable or returns no usable result.
  const scored = GOAL_RULES.map((rule) => {
    const score = rule.keywords.reduce((sum, keyword) => sum + (description.includes(keyword) ? 1 : 0), 0);
    return { rule, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score === 0) {
    return null;
  }

  const confidence = Math.max(0.45, Math.min(0.85, 0.45 + best.score * 0.12));
  return {
    input: goalDescription,
    mappedGoalKey: best.rule.goalKey,
    source: 'rules',
    confidence: Number(confidence.toFixed(2)),
    reasoning: `Keyword match score: ${best.score}`,
  };
}

export async function resolveGoalWithAssist(goal: string, goalDescription?: string): Promise<{
  scoringGoalKey: GoalKey;
  goalAssist: GoalMappingAssist;
}> {
  const selectedGoalKey = resolveGoalKey(goal);
  const normalizedDescription = goalDescription?.trim();

  if (!normalizedDescription) {
    return {
      scoringGoalKey: selectedGoalKey,
      goalAssist: {
        input: goal,
        mappedGoalKey: selectedGoalKey,
        source: 'fallback',
        confidence: 0.5,
        reasoning: 'Used selected goal value directly.',
      },
    };
  }

  // Resolution order is AI -> keyword rules -> selected goal fallback.
  const aiMapped = await mapGoalDescriptionWithAi(normalizedDescription);
  if (aiMapped) {
    return {
      scoringGoalKey: aiMapped.mappedGoalKey,
      goalAssist: {
        input: normalizedDescription,
        mappedGoalKey: aiMapped.mappedGoalKey,
        source: 'ai',
        confidence: aiMapped.confidence,
        reasoning: aiMapped.reasoning,
      },
    };
  }

  const ruleMapped = mapGoalDescriptionByRules(normalizedDescription);
  if (ruleMapped) {
    return {
      scoringGoalKey: ruleMapped.mappedGoalKey,
      goalAssist: ruleMapped,
    };
  }

  return {
    scoringGoalKey: selectedGoalKey,
    goalAssist: {
      input: normalizedDescription,
      mappedGoalKey: selectedGoalKey,
      source: 'fallback',
      confidence: 0.45,
      reasoning: 'No strong AI/rule match; defaulted to selected goal.',
    },
  };
}
