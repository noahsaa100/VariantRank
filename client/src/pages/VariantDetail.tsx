import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { Evaluation, Variant } from '../types';
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

      <Panel title="Features">
        <ul className={styles.featureList}>
          {Object.entries(features).map(([key, value]) => (
            <li className={styles.feature} key={key}>{key}: <strong>{formatFeatureValue(value)}</strong></li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
