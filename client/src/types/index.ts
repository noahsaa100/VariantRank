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
