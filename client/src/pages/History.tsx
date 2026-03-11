import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteAllEvaluations, deleteEvaluation, listEvaluations } from '../api/evaluations';
import type { EvaluationSummary } from '../types';

export function History() {
  const [history, setHistory] = useState<EvaluationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    listEvaluations()
      .then(setHistory)
      .catch(() => setError('Failed to load history.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDeleteOne(id: string) {
    const confirmed = window.confirm('Delete this evaluation from history?');
    if (!confirmed) return;

    setActionError(null);
    setDeletingId(id);
    try {
      await deleteEvaluation(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setActionError('Failed to delete evaluation.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAll() {
    if (history.length === 0) return;

    const confirmed = window.confirm('Delete all evaluations from history? This cannot be undone.');
    if (!confirmed) return;

    setActionError(null);
    setClearingAll(true);
    try {
      await deleteAllEvaluations();
      setHistory([]);
    } catch {
      setActionError('Failed to delete all history.');
    } finally {
      setClearingAll(false);
    }
  }

  if (loading) return <div className="page"><p>Loading...</p></div>;
  if (error) return <div className="page"><p className="error">{error}</p></div>;

  return (
    <div className="page">
      <div className="page-actions">
        <h2 className="page-title">Evaluation History</h2>
        <div className="history-toolbar">
          <Link to="/compare" className="btn btn--secondary">Open Compare</Link>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleDeleteAll}
            disabled={clearingAll || history.length === 0}
          >
            {clearingAll ? 'Deleting...' : 'Delete All'}
          </button>
        </div>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      {history.length === 0 && <p>No evaluations yet. <Link to="/">Run one.</Link></p>}

      <ul className="history-list">
        {history.map((evaluation) => (
          <li key={evaluation.id} className="history-item">
            <Link to={`/results/${evaluation.id}`} className="history-item__link">
              <span className="history-item__goal">{evaluation.goal}</span>
              <span className="history-item__url">{evaluation.topUrl ?? '-'}</span>
              <span className="history-item__score">Top: {evaluation.topScore?.toFixed(1) ?? '-'}</span>
              <span className="history-item__date">{new Date(evaluation.createdAt).toLocaleString()}</span>
            </Link>
            <div className="history-item__actions">
              <button
                type="button"
                className="btn btn--danger btn--small"
                onClick={() => handleDeleteOne(evaluation.id)}
                disabled={deletingId === evaluation.id || clearingAll}
              >
                {deletingId === evaluation.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
