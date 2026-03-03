import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getEvaluation } from '../api/evaluations';
import type { Evaluation } from '../types';
import { VariantCard } from '../components/VariantCard';

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

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error || !evaluation) return <div className="page"><p className="error">{error ?? 'Not found'}</p></div>;

  const sorted = [...evaluation.variants].sort((a, b) => a.rank - b.rank);

  return (
    <div className="page">
      <Link to="/" className="back-link">← New Evaluation</Link>
      <h1>Results</h1>
      <p className="meta">Goal: <strong>{evaluation.goal}</strong> · {evaluation.variants.length} variants · {evaluation.processingTime}ms</p>
      <div className="variant-list">
        {sorted.map((v) => (
          <VariantCard key={v.id} variant={v} evaluationId={evaluation.id} />
        ))}
      </div>
    </div>
  );
}
