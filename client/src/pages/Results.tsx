import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { Evaluation } from '../types';
import { VariantCard } from '../components/VariantCard';
import { ComparisonSummary } from '../components/ComparisonSummary';
import { Page, PageHeader } from '../components/Page';
import pageStyles from '../components/Page.module.css';
import styles from './Results.module.css';

export function Results() {
  const { id } = useParams<{ id: string }>();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getEvaluation(id)
      .then(setEvaluation)
      .catch(() => setError('Failed to load evaluation.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Page><p>Loading...</p></Page>;
  if (error || !evaluation) return <Page><p className={pageStyles.error}>{error ?? 'Not found'}</p></Page>;

  const sorted = [...evaluation.variants].sort((a, b) => a.rank - b.rank);

  return (
    <Page>
      <Link to="/" className={pageStyles.backLink}>Back to New Evaluation</Link>
      <PageHeader
        eyebrow="Evaluation complete"
        title="Results"
        description={<>Goal: <strong>{evaluation.goal}</strong> · {evaluation.variants.length} variants · {evaluation.processingTime}ms</>}
        actions={<div className={styles.headerActions}><Link to={`/compare?left=${evaluation.id}`}>Compare evaluations ↗</Link></div>}
      />

      <div className={styles.variantList}>
        {sorted.map((variant) => (
          <VariantCard key={variant.id} variant={variant} evaluationId={evaluation.id} />
        ))}
      </div>
      <ComparisonSummary variants={sorted} />
    </Page>
  );
}
