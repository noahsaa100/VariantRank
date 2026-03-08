export type GoalKey =
  | 'leadGeneration'
  | 'trialSignup'
  | 'directPurchase'
  | 'bookingConsultation'
  | 'contentEngagement';

export const GOAL_LABELS: Record<GoalKey, string> = {
  leadGeneration: 'Lead Generation',
  trialSignup: 'Trial Signup',
  directPurchase: 'Direct Purchase',
  bookingConsultation: 'Booking Consultation',
  contentEngagement: 'Content Engagement',
};

const GOAL_ALIASES: Record<GoalKey, string[]> = {
  leadGeneration: [
    'lead generation',
    'leadgeneration',
    'lead-gen',
    'lead capture',
  ],
  trialSignup: [
    'trial signup',
    'trial sign up',
    'trial',
    'signup trial',
  ],
  directPurchase: [
    'direct purchase',
    'purchase',
    'buy now',
    'ecommerce',
  ],
  bookingConsultation: [
    'booking',
    'book consultation',
    'booking consultation',
    'book call',
    'consultation',
  ],
  contentEngagement: [
    'content engagement',
    'engagement',
    'read content',
    'content',
  ],
};

function normalizeGoal(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function resolveGoalKey(goal: string): GoalKey {
  const normalized = normalizeGoal(goal);

  for (const [key, aliases] of Object.entries(GOAL_ALIASES) as Array<[GoalKey, string[]]>) {
    if (aliases.some((alias) => normalizeGoal(alias) === normalized)) {
      return key;
    }
  }

  return 'leadGeneration';
}
