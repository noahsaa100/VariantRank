import type { Variant } from '../types';
import styles from './ComparisonSummary.module.css';

interface ComparisonSummaryProps {
  variants: Variant[];
}

type EcommerceEvidence = Record<string, string | null>;

const EVIDENCE_LABELS: Record<string, string> = {
  reviews: 'customer reviews and social proof',
  offer: 'promotional savings',
  delivery: 'delivery information',
  returns: 'returns information',
  guarantee: 'a purchase guarantee',
  stock: 'stock availability',
  payment: 'payment options',
  subscription: 'subscription benefits',
};

const EVIDENCE_PRIORITY = [
  'offer',
  'reviews',
  'subscription',
  'stock',
  'delivery',
  'guarantee',
  'returns',
  'payment',
];

function ecommerceEvidence(variant: Variant): EcommerceEvidence {
  const aiAssist = variant.features.aiAssist;
  if (!aiAssist || typeof aiAssist !== 'object' || Array.isArray(aiAssist)) return {};

  const ecommerce = (aiAssist as Record<string, unknown>).ecommerceAnalysis;
  if (!ecommerce || typeof ecommerce !== 'object' || Array.isArray(ecommerce)) return {};

  const evidence = (ecommerce as Record<string, unknown>).evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return {};

  return Object.fromEntries(
    Object.entries(evidence as Record<string, unknown>).map(([key, value]) => [
      key,
      typeof value === 'string' && value.trim() ? value : null,
    ]),
  );
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

function shortenEvidence(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= 105 ? normalized : `${normalized.slice(0, 102).trimEnd()}…`;
}

function evidenceExamples(evidence: EcommerceEvidence, limit: number): string[] {
  return EVIDENCE_PRIORITY
    .map((key) => evidence[key])
    .filter((value): value is string => Boolean(value))
    .slice(0, limit)
    .map((value) => `“${shortenEvidence(value)}”`);
}

export function ComparisonSummary({ variants }: ComparisonSummaryProps) {
  if (variants.length === 0) return null;

  const ranked = [...variants].sort((a, b) => a.rank - b.rank);
  const winner = ranked[0];
  const winnerEvidence = ecommerceEvidence(winner);
  const detectedEvidence = Object.keys(winnerEvidence)
    .filter((key) => winnerEvidence[key])
    .map((key) => EVIDENCE_LABELS[key] ?? key)
    .slice(0, 3);

  if (ranked.length === 1) {
    const strongestCategories = Object.entries(winner.categoryScores)
      .sort(([, left], [, right]) => right - left)
      .slice(0, 2)
      .map(([category]) => category);
    const leadingPenalty = [...winner.rulePenalties]
      .sort((left, right) => left.penalty - right.penalty)[0];
    const examples = evidenceExamples(winnerEvidence, 3);
    const evidenceText = examples.length > 0
      ? ` Specific evidence included ${formatList(examples)}.`
      : detectedEvidence.length > 0
        ? ` Detected strengths included ${formatList(detectedEvidence)}.`
      : '';
    const limitationText = leadingPenalty
      ? ` The main opportunity identified was ${leadingPenalty.rule.replace(/^[^:]+:\s*/, '').toLowerCase()}.`
      : ' No major rule-based risks were identified.';

    return (
      <section className={styles.summary} aria-labelledby="comparison-summary-title">
        <h3 id="comparison-summary-title">Performance summary</h3>
        <p>
          This page scored {winner.totalScore.toFixed(1)}, performing strongest in {formatList(strongestCategories)}.
          {evidenceText}{limitationText}
        </p>
      </section>
    );
  }

  const runnerUp = ranked[1];
  const categoryDeltas = Object.keys(winner.categoryScores)
    .map((category) => ({
      category,
      delta: winner.categoryScores[category] - (runnerUp.categoryScores[category] ?? 0),
    }))
    .sort((a, b) => b.delta - a.delta);
  const leadingCategories = categoryDeltas.filter(({ delta }) => delta >= 0.5).slice(0, 2);
  const closeCategories = categoryDeltas
    .filter(({ delta }) => Math.abs(delta) < 0.5)
    .map(({ category }) => category)
    .slice(0, 3);

  const runnerEvidence = ecommerceEvidence(runnerUp);
  const distinctiveEvidence = Object.keys(winnerEvidence)
    .filter((key) => winnerEvidence[key] && !runnerEvidence[key])
    .map((key) => EVIDENCE_LABELS[key] ?? key)
    .slice(0, 3);
  const sharedEvidence = Object.keys(winnerEvidence)
    .filter((key) => winnerEvidence[key] && runnerEvidence[key])
    .map((key) => EVIDENCE_LABELS[key] ?? key)
    .slice(0, 3);
  const winnerExamples = EVIDENCE_PRIORITY
    .filter((key) => {
      const winnerValue = winnerEvidence[key];
      const runnerValue = runnerEvidence[key];
      return Boolean(winnerValue) && winnerValue?.toLowerCase() !== runnerValue?.toLowerCase();
    })
    .map((key) => winnerEvidence[key] as string)
    .slice(0, 3)
    .map((value) => `“${shortenEvidence(value)}”`);
  const runnerExamples = evidenceExamples(runnerEvidence, 2);

  const margin = winner.totalScore - runnerUp.totalScore;
  const leadReason = leadingCategories.length > 0
    ? `It led most clearly in ${formatList(leadingCategories.map(({ category, delta }) => `${category} (+${delta.toFixed(1)})`))}`
    : 'It held a small advantage across the weighted scoring signals';
  const evidenceReason = distinctiveEvidence.length > 0
    ? `, supported by detected ${formatList(distinctiveEvidence)}`
    : '';
  const competitiveReason = closeCategories.length > 0
    ? `matching closely on ${formatList(closeCategories)}`
    : sharedEvidence.length > 0
      ? `also providing ${formatList(sharedEvidence)}`
      : 'performing consistently across the remaining categories';
  const specificEvidence = winnerExamples.length > 0
    ? ` The winning page specifically presented ${formatList(winnerExamples)}.`
    : '';
  const runnerEvidenceText = runnerExamples.length > 0
    ? ` Its own strengths included ${formatList(runnerExamples)}.`
    : '';
  const fieldContext = ranked.length > 2
    ? ` Across all ${ranked.length} variants, scores ranged from ${ranked.at(-1)!.totalScore.toFixed(1)} to ${winner.totalScore.toFixed(1)}.`
    : '';

  return (
    <section className={styles.summary} aria-labelledby="comparison-summary-title">
      <h3 id="comparison-summary-title">Why this ranked higher</h3>
      <p>
        Variant #{winner.rank} ranked first by {margin.toFixed(1)} points. {leadReason}{evidenceReason}.
        {specificEvidence} Variant #{runnerUp.rank} remained competitive by {competitiveReason}.{runnerEvidenceText}{fieldContext}
      </p>
    </section>
  );
}
