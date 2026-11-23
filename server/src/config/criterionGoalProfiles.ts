import type { ScoreCategoryKey } from '@prisma/client';
import type { GoalKey } from './goals';

export interface CriterionGoalProfile {
  label: string;
  actionPattern: RegExp;
  criterionPattern: RegExp;
  applicablePageTypes: string[];
  categoryWeights: Record<ScoreCategoryKey, number>;
}

export const CRITERION_GOAL_PROFILES: Record<GoalKey, CriterionGoalProfile> = {
  directPurchase: {
    label: 'complete a purchase',
    actionPattern: /add to (?:cart|bag|basket)|buy now|select options|checkout|secure checkout/i,
    criterionPattern: /purchase|product|price|offer|cart|checkout|payment|delivery|return|stock|variant|trust|review/i,
    applicablePageTypes: ['product', 'cart', 'checkout'],
    categoryWeights: { SHOPPING_UX: 15, TRUST_CONFIDENCE: 20, OFFER_CLARITY: 20, PURCHASE_EASE: 30, TECHNICAL_ACCESSIBILITY: 15 },
  },
  trialSignup: {
    label: 'start a trial',
    actionPattern: /(?:start|begin|join|sign up|register|try)(?:\s+(?:a|your|for))?\s+(?:free\s+)?trial|free trial|try (?:it )?free/i,
    criterionPattern: /trial|sign.?up|form|cta|price|free|cancel|commitment|reassurance|trust|terms/i,
    applicablePageTypes: ['homepage', 'product', 'other'],
    categoryWeights: { SHOPPING_UX: 15, TRUST_CONFIDENCE: 20, OFFER_CLARITY: 25, PURCHASE_EASE: 30, TECHNICAL_ACCESSIBILITY: 10 },
  },
  leadGeneration: {
    label: 'submit an enquiry',
    actionPattern: /get (?:a )?quote|request (?:a )?quote|contact us|enquir|talk to (?:sales|us|an expert)|get in touch|request information/i,
    criterionPattern: /lead|contact|enquir|quote|form|cta|field|reassurance|trust|response/i,
    applicablePageTypes: ['homepage', 'product', 'other'],
    categoryWeights: { SHOPPING_UX: 15, TRUST_CONFIDENCE: 20, OFFER_CLARITY: 25, PURCHASE_EASE: 30, TECHNICAL_ACCESSIBILITY: 10 },
  },
  bookingConsultation: {
    label: 'book a consultation',
    actionPattern: /book|schedule|appointment|consultation|demo|reserve (?:a )?(?:call|slot|time)/i,
    criterionPattern: /book|schedule|appointment|consult|demo|calendar|form|cta|availability|trust/i,
    applicablePageTypes: ['homepage', 'product', 'other'],
    categoryWeights: { SHOPPING_UX: 15, TRUST_CONFIDENCE: 20, OFFER_CLARITY: 25, PURCHASE_EASE: 30, TECHNICAL_ACCESSIBILITY: 10 },
  },
  contentEngagement: {
    label: 'engage with content',
    actionPattern: /read more|learn more|view (?:guide|article|story)|watch|explore|discover|blog|journal|guides?/i,
    criterionPattern: /content|read|learn|article|video|navigation|heading|clarity|depth|engagement/i,
    applicablePageTypes: ['homepage', 'collection', 'product', 'other'],
    categoryWeights: { SHOPPING_UX: 30, TRUST_CONFIDENCE: 15, OFFER_CLARITY: 25, PURCHASE_EASE: 15, TECHNICAL_ACCESSIBILITY: 15 },
  },
};

export function criterionGoalMultiplier(goal: GoalKey, text: string): number {
  return CRITERION_GOAL_PROFILES[goal].criterionPattern.test(text) ? 1.6 : 0.8;
}
