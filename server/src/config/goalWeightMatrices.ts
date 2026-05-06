import type { BehaviouralConcept, TopLevelCategory } from './behaviouralScoring';
import type { GoalKey } from './goals';

interface GoalWeightMatrix {
  conceptMultipliers: Record<BehaviouralConcept, number>;
  categoryWeights: Record<TopLevelCategory, number>;
}

// Each goal reinterprets the same behavioural evidence through a different optimization lens.
export const GOAL_WEIGHT_MATRICES: Record<GoalKey, GoalWeightMatrix> = {
  leadGeneration: {
    conceptMultipliers: {
      messageClarity: 1.14,
      valueCommunication: 1.12,
      actionOrientation: 1.36,
      formEfficiency: 1.4,
      navigationOrientation: 1.03,
      credibilitySignals: 1.14,
      supportConfidence: 1.14,
      technicalReadiness: 0.96,
      contentDepth: 0.86,
    },
    categoryWeights: {
      UX: 0.14,
      Trust: 0.16,
      Clarity: 0.33,
      Friction: 0.32,
      Technical: 0.05,
    },
  },
  trialSignup: {
    conceptMultipliers: {
      messageClarity: 1.12,
      valueCommunication: 1.14,
      actionOrientation: 1.42,
      formEfficiency: 1.46,
      navigationOrientation: 1.03,
      credibilitySignals: 1.08,
      supportConfidence: 1.12,
      technicalReadiness: 0.98,
      contentDepth: 0.84,
    },
    categoryWeights: {
      UX: 0.14,
      Trust: 0.14,
      Clarity: 0.34,
      Friction: 0.33,
      Technical: 0.05,
    },
  },
  directPurchase: {
    conceptMultipliers: {
      messageClarity: 1.15,
      valueCommunication: 1.15,
      actionOrientation: 1.38,
      formEfficiency: 1.28,
      navigationOrientation: 1.0,
      credibilitySignals: 1.2,
      supportConfidence: 1.12,
      technicalReadiness: 1.0,
      contentDepth: 0.9,
    },
    categoryWeights: {
      UX: 0.16,
      Trust: 0.18,
      Clarity: 0.31,
      Friction: 0.30,
      Technical: 0.05,
    },
  },
  bookingConsultation: {
    conceptMultipliers: {
      messageClarity: 1.12,
      valueCommunication: 1.1,
      actionOrientation: 1.32,
      formEfficiency: 1.36,
      navigationOrientation: 1.04,
      credibilitySignals: 1.16,
      supportConfidence: 1.18,
      technicalReadiness: 0.96,
      contentDepth: 0.88,
    },
    categoryWeights: {
      UX: 0.15,
      Trust: 0.17,
      Clarity: 0.33,
      Friction: 0.30,
      Technical: 0.05,
    },
  },
  contentEngagement: {
    conceptMultipliers: {
      messageClarity: 1.36,
      valueCommunication: 1.08,
      actionOrientation: 0.82,
      formEfficiency: 0.8,
      navigationOrientation: 1.16,
      credibilitySignals: 1.0,
      supportConfidence: 1.12,
      technicalReadiness: 0.98,
      contentDepth: 1.42,
    },
    categoryWeights: {
      UX: 0.29,
      Trust: 0.2,
      Clarity: 0.35,
      Friction: 0.09,
      Technical: 0.07,
    },
  },
};
