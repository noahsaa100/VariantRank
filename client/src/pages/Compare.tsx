import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getEvaluation, listEvaluations } from '../api/evaluations';
import type { Evaluation, EvaluationSummary, Variant } from '../types';

function getBestVariant(evaluation: Evaluation | null): Variant | null {
  if (!evaluation || evaluation.variants.length === 0) return null;
  const sorted = [...evaluation.variants].sort((a, b) => a.rank - b.rank);
  return sorted[0] ?? null;
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

  if (historyLoading) return <div className="page"><p>Loading...</p></div>;
  if (historyError) return <div className="page"><p className="error">{historyError}</p></div>;

  return (
    <div className="page">
      <h2 className="page-title">Compare</h2>
      <p className="meta">Compare top-ranked variants from two evaluations.</p>

      {history.length < 2 && (
        <div className="detail-section">
          <p>You need at least two evaluations to compare.</p>
          <p><Link to="/">Run a new evaluation</Link> and return here.</p>
        </div>
      )}

      {history.length >= 2 && (
        <>
          <div className="compare-controls">
            <label>
              Left evaluation
              <select
                value={leftId}
                onChange={(event) => updateSelection('left', event.target.value)}
              >
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.createdAt).toLocaleString()} - {item.goal}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Right evaluation
              <select
                value={rightId}
                onChange={(event) => updateSelection('right', event.target.value)}
              >
                {history.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.createdAt).toLocaleString()} - {item.goal}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {comparisonLoading && <p>Loading comparison...</p>}
          {comparisonError && <p className="error">{comparisonError}</p>}

          {!comparisonLoading && !comparisonError && leftEvaluation && rightEvaluation && (
            <div className="compare-grid">
              <section className="detail-section compare-card">
                <h3>Left</h3>
                <p className="meta">Goal: {leftEvaluation.goal}</p>
                {leftVariant ? (
                  <>
                    <p><a href={leftVariant.url} target="_blank" rel="noopener noreferrer">{leftVariant.url}</a></p>
                    <p>Top score: <strong>{leftVariant.totalScore.toFixed(1)}</strong></p>
                    <p><Link to={`/results/${leftEvaluation.id}`}>Open results</Link></p>
                  </>
                ) : (
                  <p>No variants found.</p>
                )}
              </section>

              <section className="detail-section compare-card">
                <h3>Right</h3>
                <p className="meta">Goal: {rightEvaluation.goal}</p>
                {rightVariant ? (
                  <>
                    <p><a href={rightVariant.url} target="_blank" rel="noopener noreferrer">{rightVariant.url}</a></p>
                    <p>Top score: <strong>{rightVariant.totalScore.toFixed(1)}</strong></p>
                    <p><Link to={`/results/${rightEvaluation.id}`}>Open results</Link></p>
                  </>
                ) : (
                  <p>No variants found.</p>
                )}
              </section>
            </div>
          )}

          {!comparisonLoading && !comparisonError && leftVariant && rightVariant && categories.length > 0 && (
            <section className="detail-section">
              <h3>Category Breakdown</h3>
              <div className="compare-table">
                <div className="compare-table__header">Category</div>
                <div className="compare-table__header">Left</div>
                <div className="compare-table__header">Right</div>
                {categories.map((category) => {
                  const leftScore = leftVariant.categoryScores[category] ?? 0;
                  const rightScore = rightVariant.categoryScores[category] ?? 0;
                  return (
                    <div key={category} className="compare-table__row">
                      <span className="compare-table__category">{category}</span>
                      <span>{leftScore.toFixed(1)}</span>
                      <span>{rightScore.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
