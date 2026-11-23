export interface CategoryScores {
  UX: number;
  Trust: number;
  Clarity: number;
  Friction: number;
  Technical: number;
  [key: string]: number;
}

export interface RulePenalty {
  rule: string;
  penalty: number;
}

export type Features = Record<string, unknown>;

export type CriterionStatus = 'GOOD' | 'CAN_BE_IMPROVED' | 'BAD' | 'NOT_RELEVANT' | 'NEEDS_REVIEW' | 'NOT_OBSERVED';

export interface CriterionResult {
  id: string;
  criterionId: string;
  status: CriterionStatus;
  method: 'AUTOMATED' | 'AI_ASSISTED' | 'MANUAL';
  evidence: { summary?: string; pageType?: string } | null;
  explanation: string | null;
  confidence: number | null;
  criterion: {
    title: string;
    description: string;
    pageAreas: string[];
  };
}

export interface Variant {
  id: string;
  evaluationId: string;
  url: string;
  rank: number;
  totalScore: number;
  categoryScores: CategoryScores;
  rulePenalties: RulePenalty[];
  topDrivers: string[];
  features: Features;
  criterionResults?: CriterionResult[];
  siteRootUrl?: string | null;
  pageType?: string | null;
}

export interface Evaluation {
  id: string;
  createdAt: string;
  goal: string;
  urls: string[];
  anonymousSessionId: string | null;
  processingTime: number;
  scanMode?: 'SINGLE_PAGE' | 'FULL_SITE';
  siteSummary?: { stores: Array<{
    rootUrl: string;
    overallScore: number;
    categoryScores: Record<string, number>;
    pagesScanned: number;
    pageTypes: Record<string, number>;
  }>;
  comparisonNarrative?: string | null;
  storeInsights?: Array<{ url: string; strengths: string[]; improvements: string[] }>;
  } | null;
  crawlReport?: {
    stores: Array<{
      rootUrl: string;
      pages: Array<{ url: string; expectedType: string; source: string }>;
      shopperFlow: {
      productUrl: string | null;
      addedToCart: boolean;
      cartUrl: string | null;
      checkoutUrl: string | null;
      stoppedAtCheckoutEntry: boolean;
      notes: string[];
      };
    }>;
  } | null;
  aiUsage?: {
    model: string;
    requestCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
    estimatedCostUsd: number;
  } | null;
  variants: Variant[];
}

export interface EvaluationSummary {
  id: string;
  createdAt: string;
  goal: string;
  topScore: number | null;
  topUrl: string | null;
}
