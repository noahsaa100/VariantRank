import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEvaluations } from '../api/evaluations';
import type { EvaluationSummary } from '../types';

export function History() {
  const [history, setHistory] = useState<EvaluationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listEvaluations()
      .then(setHistory)
      .catch(() => setError('Failed to load history.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page"><p>Loading…</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <h1>Evaluation History</h1>
      {history.length === 0 && <p>No evaluations yet. <Link to="/">Run one!</Link></p>}
      <ul className="history-list">
        {history.map((ev) => (
          <li key={ev.id} className="history-item">
            <Link to={`/results/${ev.id}`} className="history-item__link">
              <span className="history-item__goal">{ev.goal}</span>
              <span className="history-item__url">{ev.topUrl ?? '—'}</span>
              <span className="history-item__score">Top: {ev.topScore?.toFixed(1) ?? '—'}</span>
              <span className="history-item__date">{new Date(ev.createdAt).toLocaleString()}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
