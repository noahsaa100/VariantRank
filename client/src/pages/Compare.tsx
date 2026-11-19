import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getEvaluation, listEvaluations } from '../api/evaluations';
import type { Evaluation, EvaluationSummary, Variant } from '../types';
import { Page, PageHeader } from '../components/Page';
import pageStyles from '../components/Page.module.css';
import { Panel } from '../components/Panel';
import styles from './Compare.module.css';

function getBestVariant(evaluation: Evaluation | null): Variant | null {
  if (!evaluation || evaluation.variants.length === 0) return null;
  const sorted = [...evaluation.variants].sort((a, b) => a.rank - b.rank);
  return sorted[0] ?? null;
}

function formatEvaluationOption(evaluation: EvaluationSummary): string {
  const date = new Date(evaluation.createdAt).toLocaleString();
  const url = evaluation.topUrl ?? 'No URL available';
  return `${date} — ${url} — ${evaluation.goal}`;
}

export function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [history, setHistory] = useState<EvaluationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [leftEvaluation, setLeftEvaluation] = useState<Evaluation | null>(null);
  const [rightEvaluation, setRightEvaluation] = useState<Evaluation | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  const leftId = searchParams.get('left') ?? '';
  const rightId = searchParams.get('right') ?? '';

  useEffect(() => {
    listEvaluations()
      .then((items: EvaluationSummary[]) => {
        setHistory(items);
        if (items.length > 0 && (!leftId || !rightId)) {
          const first = leftId || items[0].id;
          const second = rightId || items.find((item) => item.id !== first)?.id || items[0].id;
          setSearchParams({ left: first, right: second }, { replace: true });
        }
      })
      .catch(() => setHistoryError('Failed to load evaluations for comparison.'))
      .finally(() => setHistoryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!leftId || !rightId) return;
    setComparisonLoading(true);
    setComparisonError(null);

    Promise.all([getEvaluation(leftId), getEvaluation(rightId)])
      .then(([left, right]) => {
        setLeftEvaluation(left as Evaluation);
        setRightEvaluation(right as Evaluation);
      })
      .catch(() => {
        setComparisonError('Failed to load selected evaluations.');
        setLeftEvaluation(null);
        setRightEvaluation(null);
      })
      .finally(() => setComparisonLoading(false));
  }, [leftId, rightId]);

  const leftVariant = getBestVariant(leftEvaluation);
  const rightVariant = getBestVariant(rightEvaluation);

  const categories = useMemo(() => {
    const keys = new Set<string>();
    if (leftVariant) Object.keys(leftVariant.categoryScores).forEach((key) => keys.add(key));
    if (rightVariant) Object.keys(rightVariant.categoryScores).forEach((key) => keys.add(key));
    return [...keys];
  }, [leftVariant, rightVariant]);

  function updateSelection(side: 'left' | 'right', id: string) {
    const nextLeft = side === 'left' ? id : leftId;
    const nextRight = side === 'right' ? id : rightId;
    setSearchParams({ left: nextLeft, right: nextRight });
  }

  if (historyLoading) return <Page><p>Loading...</p></Page>;
  if (historyError) return <Page><p className={pageStyles.error}>{historyError}</p></Page>;

  return (
    <Page>
      <PageHeader
        eyebrow="Side by side"
        title="Compare"
        description="Compare the top-ranked variants from two evaluations."
      />

      {history.length < 2 && (
        <Panel>
          <p>You need at least two evaluations to compare.</p>
          <p><Link to="/">Run a new evaluation</Link> and return here.</p>
        </Panel>
      )}

      {history.length >= 2 && (
        <>
          <div className={styles.controls}>
            <label className={styles.field}>
              Left evaluation
              <select className={styles.select}
                value={leftId}
                onChange={(event) => updateSelection('left', event.target.value)}
              >
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatEvaluationOption(item)}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              Right evaluation
              <select className={styles.select}
                value={rightId}
                onChange={(event) => updateSelection('right', event.target.value)}
              >
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {formatEvaluationOption(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {comparisonLoading && <p>Loading comparison...</p>}
          {comparisonError && <p className={pageStyles.error}>{comparisonError}</p>}

          {!comparisonLoading && !comparisonError && leftEvaluation && rightEvaluation && (
            <div className={styles.grid}>
              <Panel title="Left" className={styles.cardContent}>
                <p className={pageStyles.meta}>Goal: {leftEvaluation.goal}</p>
                {leftVariant ? (
                  <>
                    <p><a href={leftVariant.url} target="_blank" rel="noopener noreferrer">{leftVariant.url}</a></p>
                    <p>Top score: <strong>{leftVariant.totalScore.toFixed(1)}</strong></p>
                    <p><Link to={`/results/${leftEvaluation.id}`}>Open results</Link></p>
                  </>
                ) : (
                  <p>No variants found.</p>
                )}
              </Panel>

              <Panel title="Right" className={styles.cardContent}>
                <p className={pageStyles.meta}>Goal: {rightEvaluation.goal}</p>
                {rightVariant ? (
                  <>
                    <p><a href={rightVariant.url} target="_blank" rel="noopener noreferrer">{rightVariant.url}</a></p>
                    <p>Top score: <strong>{rightVariant.totalScore.toFixed(1)}</strong></p>
                    <p><Link to={`/results/${rightEvaluation.id}`}>Open results</Link></p>
                  </>
                ) : (
                  <p>No variants found.</p>
                )}
              </Panel>
            </div>
          )}

          {!comparisonLoading && !comparisonError && leftVariant && rightVariant && categories.length > 0 && (
            <Panel title="Category Breakdown">
              <div className={styles.table}>
                <div className={styles.tableHeader}>Category</div>
                <div className={styles.tableHeader}>Left</div>
                <div className={styles.tableHeader}>Right</div>
                {categories.map((category) => {
                  const leftScore = leftVariant.categoryScores[category] ?? 0;
                  const rightScore = rightVariant.categoryScores[category] ?? 0;
                  return (
                    <div key={category} className={styles.tableRow}>
                      <span className={styles.category}>{category}</span>
                      <span>{leftScore.toFixed(1)}</span>
                      <span>{rightScore.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </>
      )}
    </Page>
  );
}
