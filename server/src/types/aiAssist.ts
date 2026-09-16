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

export interface EcommerceAnalysisAssist {
  pageType: 'product' | 'collection' | 'cart' | 'other';
  primaryPurchaseCta: string | null;
  evidence: {
    reviews: string | null;
    offer: string | null;
    delivery: string | null;
    returns: string | null;
    guarantee: string | null;
    stock: string | null;
    payment: string | null;
    subscription: string | null;
  };
  scores: {
    purchaseClarity: number;
    purchaseConfidence: number;
    offerStrength: number;
    merchandisingQuality: number;
  };
  reasoning: string[];
  source: 'ai';
  confidence: number;
}

export interface AiAssistMetadata {
  goalMapping?: GoalMappingAssist;
  ctaClassification?: CtaClassificationAssist;
  ecommerceAnalysis?: EcommerceAnalysisAssist;
}
