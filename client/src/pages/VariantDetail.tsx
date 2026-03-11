import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { Evaluation, Variant } from '../types';
import { ScoreBar } from '../components/ScoreBar';

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

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (error || !variant || !evaluation) return <div className="page"><p className="error">{error ?? 'Not found'}</p></div>;

  const features = variant.features as Record<string, unknown>;

  return (
    <div className="page">
      <Link to={`/results/${evaluation.id}`} className="back-link">Back to Results</Link>

      <h2 className="page-title">Variant Detail</h2>
      <p className="meta">
        <a href={variant.url} target="_blank" rel="noopener noreferrer">{variant.url}</a>
        {' | '}Rank #{variant.rank} | Score {variant.totalScore.toFixed(1)}
      </p>

      <section className="detail-section">
        <h3>Category Scores</h3>
        {Object.entries(variant.categoryScores).map(([key, value]) => (
          <ScoreBar key={key} label={key} score={value} />
        ))}
      </section>

      <section className="detail-section">
        <h3>Top Drivers</h3>
        <ul>
          {variant.topDrivers.map((driver) => <li key={driver}>{driver}</li>)}
        </ul>
      </section>

      {variant.rulePenalties.length > 0 && (
        <section className="detail-section">
          <h3>Rule Penalties</h3>
          <ul>
            {variant.rulePenalties.map((penalty) => (
              <li key={penalty.rule}>{penalty.rule}: <strong>{penalty.penalty}</strong></li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-section">
        <h3>Features</h3>
        <ul>
          {Object.entries(features).map(([key, value]) => (
            <li key={key}>{key}: <strong>{formatFeatureValue(value)}</strong></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
