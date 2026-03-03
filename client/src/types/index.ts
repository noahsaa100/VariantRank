export interface CategoryScores {
  design: number;
  performance: number;
  copywriting: number;
  trustSignals: number;
  ux: number;
}

export interface RulePenalty {
  rule: string;
  penalty: number;
}

export interface Features {
  hasCTA: boolean;
  hasTestimonials: boolean;
  hasVideo: boolean;
  hasPricing: boolean;
  hasFAQ: boolean;
  mobileFriendly: boolean;
  pageSpeedScore: number;
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
}

export interface Evaluation {
  id: string;
  createdAt: string;
  goal: string;
  urls: string[];
  anonymousSessionId: string | null;
  processingTime: number;
  variants: Variant[];
}

export interface EvaluationSummary {
  id: string;
  createdAt: string;
  goal: string;
  topScore: number | null;
  topUrl: string | null;
}
