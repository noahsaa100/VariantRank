import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { Evaluation, Variant } from '../types';
import { ScoreBar } from '../components/ScoreBar';

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
        const v = ev.variants.find((v: Variant) => v.id === variantId);
        setVariant(v ?? null);
      })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false));
  }, [id, variantId]);

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error || !variant || !evaluation) return <div className="page"><p className="error">{error ?? 'Not found'}</p></div>;

  const features = variant.features as unknown as Record<string, unknown>;

  return (
    <div className="page">
      <Link to={`/results/${evaluation.id}`} className="back-link">← Back to Results</Link>
      <h1>Variant Detail</h1>
      <p className="meta">
        <a href={variant.url} target="_blank" rel="noopener noreferrer">{variant.url}</a>
        {' · '}Rank #{variant.rank} · Score {variant.totalScore.toFixed(1)}
      </p>

      <section className="detail-section">
        <h2>Category Scores</h2>
        {Object.entries(variant.categoryScores).map(([k, v]) => (
          <ScoreBar key={k} label={k} score={v} />
        ))}
      </section>

      <section className="detail-section">
        <h2>Top Drivers</h2>
        <ul>
          {variant.topDrivers.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </section>

      {variant.rulePenalties.length > 0 && (
        <section className="detail-section">
          <h2>Rule Penalties</h2>
          <ul>
            {variant.rulePenalties.map((p) => (
              <li key={p.rule}>{p.rule}: <strong>{p.penalty}</strong></li>
            ))}
          </ul>
        </section>
      )}

      <section className="detail-section">
        <h2>Features</h2>
        <ul>
          {Object.entries(features).map(([k, v]) => (
            <li key={k}>{k}: <strong>{String(v)}</strong></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
