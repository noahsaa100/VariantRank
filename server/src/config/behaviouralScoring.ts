export type TopLevelCategory = 'UX' | 'Trust' | 'Clarity' | 'Friction' | 'Technical';

export const TOP_LEVEL_CATEGORIES: TopLevelCategory[] = [
  'UX',
  'Trust',
  'Clarity',
  'Friction',
  'Technical',
];

export type BehaviouralConcept =
  | 'messageClarity'
  | 'valueCommunication'
  | 'actionOrientation'
  | 'formEfficiency'
  | 'navigationOrientation'
  | 'credibilitySignals'
  | 'supportConfidence'
  | 'technicalReadiness'
  | 'contentDepth';

export const CONCEPT_LABELS: Record<BehaviouralConcept, string> = {
  messageClarity: 'message clarity',
  valueCommunication: 'value communication',
  actionOrientation: 'action orientation',
  formEfficiency: 'form efficiency',
  navigationOrientation: 'navigation orientation',
  credibilitySignals: 'credibility signals',
  supportConfidence: 'support confidence',
  technicalReadiness: 'technical readiness',
  contentDepth: 'content depth',
};

// Mapping from user-facing categories to deeper behavioural concepts.
export const CATEGORY_CONCEPT_MAP: Record<TopLevelCategory, Record<BehaviouralConcept, number>> = {
  UX: {
    navigationOrientation: 0.35,
    actionOrientation: 0.25,
    formEfficiency: 0.2,
    messageClarity: 0.1,
    technicalReadiness: 0.1,
    valueCommunication: 0,
    credibilitySignals: 0,
    supportConfidence: 0,
    contentDepth: 0,
  },
  Trust: {
    credibilitySignals: 0.45,
    supportConfidence: 0.35,
    technicalReadiness: 0.15,
    contentDepth: 0.05,
    messageClarity: 0,
    valueCommunication: 0,
    actionOrientation: 0,
    formEfficiency: 0,
    navigationOrientation: 0,
  },
  Clarity: {
    messageClarity: 0.45,
    valueCommunication: 0.35,
    contentDepth: 0.2,
    actionOrientation: 0,
    formEfficiency: 0,
    navigationOrientation: 0,
    credibilitySignals: 0,
    supportConfidence: 0,
    technicalReadiness: 0,
  },
  Friction: {
    formEfficiency: 0.6,
    navigationOrientation: 0.2,
    actionOrientation: 0.15,
    technicalReadiness: 0.05,
    messageClarity: 0,
    valueCommunication: 0,
    credibilitySignals: 0,
    supportConfidence: 0,
    contentDepth: 0,
  },
  Technical: {
    technicalReadiness: 0.6,
    navigationOrientation: 0.15,
    credibilitySignals: 0.15,
    contentDepth: 0.1,
    messageClarity: 0,
    valueCommunication: 0,
    actionOrientation: 0,
    formEfficiency: 0,
    supportConfidence: 0,
  },
};

export const DOMINANT_CATEGORY_BY_CONCEPT: Record<BehaviouralConcept, TopLevelCategory> = {
  messageClarity: 'Clarity',
  valueCommunication: 'Clarity',
  actionOrientation: 'UX',
  formEfficiency: 'Friction',
  navigationOrientation: 'UX',
  credibilitySignals: 'Trust',
  supportConfidence: 'Trust',
  technicalReadiness: 'Technical',
  contentDepth: 'Clarity',
};
