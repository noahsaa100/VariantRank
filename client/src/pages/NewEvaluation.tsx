import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEvaluation } from '../api/evaluations';
import { getOrCreateSessionId } from '../utils/session';
import { Button } from '../components/Button';
import { SquishSwitch } from '../components/SquishSwitch';
import { Page, PageHeader } from '../components/Page';
import pageStyles from '../components/Page.module.css';
import styles from './NewEvaluation.module.css';

const GOALS = [
  'Lead generation',
  'Trial signup',
  'Direct purchase',
  'Booking',
  'Content engagement',
];

export function NewEvaluation() {
  const [scanMode, setScanMode] = useState<'SINGLE_PAGE' | 'FULL_SITE'>('SINGLE_PAGE');
  const [urlsText, setUrlsText] = useState('');
  const [goal, setGoal] = useState(GOALS[0]);
  const [goalDescription, setGoalDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [loading]);

  const progress = !loading
    ? 0
    : elapsedSeconds < 10
      ? 8 + elapsedSeconds * 1.4
      : elapsedSeconds < 35
        ? 22 + (elapsedSeconds - 10) * 1.2
        : elapsedSeconds < 75
          ? 52 + (elapsedSeconds - 35) * 0.7
          : Math.min(95, 80 + (elapsedSeconds - 75) * 0.2);
  const progressLabel = elapsedSeconds < 12
    ? scanMode === 'FULL_SITE' ? 'Discovering representative store pages' : 'Rendering desktop and mobile pages'
    : elapsedSeconds < 40
      ? scanMode === 'FULL_SITE' ? 'Testing the product, cart and checkout journey' : 'Extracting page evidence'
      : elapsedSeconds < 75
        ? 'Evaluating Cake checks'
        : 'Finalising scores and evidence';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const urls = urlsText
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      setError('Please enter at least one URL.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const session = getOrCreateSessionId();
      const evaluation = await createEvaluation({
        urls: scanMode === 'FULL_SITE' ? urls.slice(0, 2) : urls,
        goal,
        goalDescription: goalDescription.trim() || undefined,
        anonymousSessionId: session,
        scanMode,
      });
      navigate(`/results/${evaluation.id}`);
    } catch {
      setError('Failed to run evaluation. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Decision support"
        title="Run an evaluation"
        description="Compare pages against the same conversion goal and surface the evidence behind every score."
      />
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <div className={styles.fieldHeader}>
            <label className={styles.label} htmlFor="urls">URLs (one per line)</label>
            <SquishSwitch
              checked={scanMode === 'FULL_SITE'}
              onChange={(checked) => setScanMode(checked ? 'FULL_SITE' : 'SINGLE_PAGE')}
              offLabel="Single page"
              onLabel="Full site"
              disabled={loading}
            />
          </div>
          <textarea
            className={styles.control}
            id="urls"
            rows={6}
            placeholder="https://example.com\nhttps://another.com"
            value={urlsText}
            onChange={(e) => setUrlsText(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="goal">Goal</label>
          <select className={styles.control} id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
            {GOALS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="goalDescription">Goal Description (optional)</label>
          <textarea
            className={styles.control}
            id="goalDescription"
            rows={3}
            placeholder="Describe your conversion objective in your own words..."
            value={goalDescription}
            onChange={(e) => setGoalDescription(e.target.value)}
          />
        </div>

        {error && <p className={pageStyles.error}>{error}</p>}
        <div className={styles.submitRow}>
          <Button className={styles.submit} type="submit" disabled={loading}>
            {loading ? 'Running...' : 'Run Evaluation'}
          </Button>
          {loading && (
            <div className={styles.progressWrap} aria-live="polite">
              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label="Evaluation progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress)}
              >
                <span className={styles.progressBar} style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.progressText}>{progressLabel} · {elapsedSeconds}s</span>
            </div>
          )}
        </div>
      </form>
    </Page>
  );
}
