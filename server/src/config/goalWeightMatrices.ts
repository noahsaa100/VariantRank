import type { BehaviouralConcept, TopLevelCategory } from './behaviouralScoring';
import type { GoalKey } from './goals';

interface GoalWeightMatrix {
  conceptMultipliers: Record<BehaviouralConcept, number>;
  categoryWeights: Record<TopLevelCategory, number>;
}

export const GOAL_WEIGHT_MATRICES: Record<GoalKey, GoalWeightMatrix> = {
  leadGeneration: {
    conceptMultipliers: {
      messageClarity: 1.1,
      valueCommunication: 1.15,
      actionOrientation: 1.3,
      formEfficiency: 1.25,
      navigationOrientation: 1.05,
      credibilitySignals: 1.1,
      supportConfidence: 1.1,
      technicalReadiness: 1.0,
      contentDepth: 0.9,
    },
    categoryWeights: {
      UX: 0.24,
      Trust: 0.2,
      Clarity: 0.21,
      Friction: 0.23,
      Technical: 0.12,
    },
  },
  trialSignup: {
    conceptMultipliers: {
      messageClarity: 1.05,
      valueCommunication: 1.2,
      actionOrientation: 1.35,
      formEfficiency: 1.3,
      navigationOrientation: 1.05,
      credibilitySignals: 1.0,
      supportConfidence: 1.05,
      technicalReadiness: 1.1,
      contentDepth: 0.85,
    },
    categoryWeights: {
      UX: 0.26,
      Trust: 0.17,
      Clarity: 0.2,
      Friction: 0.25,
      Technical: 0.12,
    },
  },
  directPurchase: {
    conceptMultipliers: {
      messageClarity: 1.15,
      valueCommunication: 1.2,
      actionOrientation: 1.25,
      formEfficiency: 1.15,
      navigationOrientation: 1.0,
      credibilitySignals: 1.25,
      supportConfidence: 1.1,
      technicalReadiness: 1.15,
      contentDepth: 0.95,
    },
    categoryWeights: {
      UX: 0.22,
      Trust: 0.24,
      Clarity: 0.21,
      Friction: 0.18,
      Technical: 0.15,
    },
  },
  bookingConsultation: {
    conceptMultipliers: {
      messageClarity: 1.1,
      valueCommunication: 1.1,
      actionOrientation: 1.2,
      formEfficiency: 1.2,
      navigationOrientation: 1.05,
      credibilitySignals: 1.15,
      supportConfidence: 1.3,
      technicalReadiness: 1.0,
      contentDepth: 0.9,
    },
    categoryWeights: {
      UX: 0.2,
      Trust: 0.26,
      Clarity: 0.18,
      Friction: 0.22,
      Technical: 0.14,
    },
  },
  contentEngagement: {
    conceptMultipliers: {
      messageClarity: 1.3,
      valueCommunication: 1.1,
      actionOrientation: 0.9,
      formEfficiency: 0.9,
      navigationOrientation: 1.2,
      credibilitySignals: 1.0,
      supportConfidence: 1.05,
      technicalReadiness: 1.05,
      contentDepth: 1.35,
    },
    categoryWeights: {
      UX: 0.2,
      Trust: 0.17,
      Clarity: 0.31,
      Friction: 0.12,
      Technical: 0.2,
    },
  },
};
