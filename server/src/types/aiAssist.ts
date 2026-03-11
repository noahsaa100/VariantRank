import type { GoalKey } from '../config/goals';

export type AiActionType = 'action' | 'informational' | 'mixed' | 'unknown';
export type AiCommitmentLevel = 'low' | 'medium' | 'high' | 'unknown';

export interface GoalMappingAssist {
  input: string;
  mappedGoalKey: GoalKey;
  source: 'ai' | 'rules' | 'fallback';
  confidence: number;
  reasoning: string;
}

export interface CtaClassificationAssist {
  primaryCtaText: string;
  actionType: AiActionType;
  commitmentLevel: AiCommitmentLevel;
  riskReduction: {
    present: boolean;
    cues: string[];
  };
  source: 'ai';
  confidence: number;
  reasoning: string;
}

export interface AiAssistMetadata {
  goalMapping?: GoalMappingAssist;
  ctaClassification?: CtaClassificationAssist;
}
