import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { CriterionResult, CriterionStatus, Evaluation, Variant } from '../types';
import { ScoreBar } from '../components/ScoreBar';
import { Page, PageHeader } from '../components/Page';
import pageStyles from '../components/Page.module.css';
import { Panel } from '../components/Panel';
import styles from './VariantDetail.module.css';

function formatFeatureValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null || value === undefined) {
    return '-';
  }

  return JSON.stringify(value);
}

const STATUS_LABELS: Record<CriterionStatus, string> = {
  GOOD: 'Good',
  CAN_BE_IMPROVED: 'Can be improved',
  BAD: 'Bad',
  NOT_RELEVANT: 'Not relevant',
  NEEDS_REVIEW: 'Needs review',
  NOT_OBSERVED: 'Not observed',
};

function CriterionRow({ result }: { result: CriterionResult }) {
  const evidence = result.evidence?.summary || result.explanation || 'No evidence was recorded.';
  return (
    <li className={styles.checkRow}>
      <details className={styles.checkDetails}>
      <summary className={styles.checkHeading}>
        <div>
          <strong className={styles.checkTitle}>{result.criterion.title}</strong>
          <p className={styles.checkDescription}>{result.criterion.description}</p>
        </div>
        <span className={`${styles.status} ${styles[`status${result.status}`]}`}>{STATUS_LABELS[result.status]}</span>
      </summary>
      <p className={styles.evidence}>{evidence}</p>
      <div className={styles.checkMeta}>
        <span>{result.method.replace('_', ' ').toLowerCase()}</span>
        {result.evidence?.pageType && <span>{result.evidence.pageType} page</span>}
        {result.confidence !== null && <span>{Math.round(result.confidence * 100)}% confidence</span>}
      </div>
      </details>
    </li>
  );
}

export function VariantDetail() {
  const { id, variantId } = useParams<{ id: string; variantId: string }>();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getEvaluation(id)
      .then((ev: Evaluation) => {
        setEvaluation(ev);
        const matched = ev.variants.find((item: Variant) => item.id === variantId);
        setVariant(matched ?? null);
      })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [id, variantId]);

  if (loading) return <Page><p>Loading...</p></Page>;
  if (error || !variant || !evaluation) return <Page><p className={pageStyles.error}>{error ?? 'Not found'}</p></Page>;

  const features = variant.features as Record<string, unknown>;
  const allChecks = variant.criterionResults ?? [];
  const checks = allChecks.filter(
    (check) => check.status !== 'NEEDS_REVIEW' && check.status !== 'NOT_OBSERVED',
  );
  const assessedCount = allChecks.filter((check) => ['GOOD', 'CAN_BE_IMPROVED', 'BAD'].includes(check.status)).length;

  return (
    <Page>
      <Link to={`/results/${evaluation.id}`} className={pageStyles.backLink}>Back to Results</Link>
      <PageHeader
        eyebrow={`Rank #${variant.rank}`}
        title="Variant detail"
        description={<><a href={variant.url} target="_blank" rel="noopener noreferrer">{variant.url}</a> · Score {variant.totalScore.toFixed(1)}</>}
      />

      <Panel title="Category Scores" tone="dark">
        <div className={styles.stack}>
          {Object.entries(variant.categoryScores).map(([key, value]) => (
            <ScoreBar key={key} label={key} score={value} />
          ))}
        </div>
      </Panel>

      <Panel title="Top Drivers">
        <ul className={styles.list}>
          {variant.topDrivers.map((driver) => <li className={styles.listItem} key={driver}>{driver}</li>)}
        </ul>
      </Panel>

      {variant.rulePenalties.length > 0 && (
        <Panel title="Rule Penalties">
          <ul className={styles.list}>
            {variant.rulePenalties.map((penalty) => (
              <li className={styles.listItem} key={penalty.rule}>{penalty.rule}: <strong>{penalty.penalty}</strong></li>
            ))}
          </ul>
        </Panel>
      )}

      {checks.length > 0 ? (
        <Panel title="Checks & evidence">
          <details className={styles.checkDisclosure}>
          <summary className={styles.disclosureSummary}>{assessedCount} of {allChecks.length} applicable checks assessed — expand evidence</summary>
          <div className={styles.checkSummary}>
            {Object.entries(STATUS_LABELS).map(([status, label]) => {
              const count = checks.filter((check) => check.status === status).length;
              return count > 0 ? <span key={status}><strong>{count}</strong> {label}</span> : null;
            })}
          </div>
          <ul className={styles.checkList}>
            {checks.map((result) => <CriterionRow key={result.id} result={result} />)}
          </ul>
          </details>
        </Panel>
      ) : (
        <Panel title="Features">
          <ul className={styles.featureList}>
            {Object.entries(features).map(([key, value]) => (
              <li className={styles.feature} key={key}>{key}: <strong>{formatFeatureValue(value)}</strong></li>
            ))}
          </ul>
        </Panel>
      )}
    </Page>
  );
}
