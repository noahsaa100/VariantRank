import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteAllEvaluations, deleteEvaluation, listEvaluations } from '../api/evaluations';
import type { EvaluationSummary } from '../types';
import { Button, ButtonLink } from '../components/Button';
import { Page, PageHeader } from '../components/Page';
import pageStyles from '../components/Page.module.css';
import styles from './History.module.css';

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

  if (loading) return <Page><p>Loading...</p></Page>;
  if (error) return <Page><p className={pageStyles.error}>{error}</p></Page>;

  return (
    <Page>
      <PageHeader
        eyebrow="Archive"
        title="Evaluation history"
        description={`${history.length} saved evaluation${history.length === 1 ? '' : 's'}`}
        actions={
        <div className={styles.toolbar}>
          <ButtonLink to="/compare" variant="secondary">Open Compare</ButtonLink>
          <Button
            type="button"
            variant="danger"
            onClick={handleDeleteAll}
            disabled={clearingAll || history.length === 0}
          >
            {clearingAll ? 'Deleting...' : 'Delete All'}
          </Button>
        </div>}
      />

      {actionError && <p className={pageStyles.error}>{actionError}</p>}

      {history.length === 0 && <p>No evaluations yet. <Link to="/">Run one.</Link></p>}

      <ul className={styles.list}>
        {history.map((evaluation) => (
          <li key={evaluation.id} className={styles.item}>
            <Link to={`/results/${evaluation.id}`} className={styles.itemLink}>
              <span className={styles.goal}>{evaluation.goal}</span>
              <span className={styles.url}>{evaluation.topUrl ?? '-'}</span>
              <span className={styles.score}>Top: {evaluation.topScore?.toFixed(1) ?? '-'}</span>
              <span className={styles.date}>{new Date(evaluation.createdAt).toLocaleString()}</span>
            </Link>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="danger"
                size="small"
                onClick={() => handleDeleteOne(evaluation.id)}
                disabled={deletingId === evaluation.id || clearingAll}
              >
                {deletingId === evaluation.id ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Page>
  );
}
