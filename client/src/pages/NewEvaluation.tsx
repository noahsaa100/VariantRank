import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEvaluation } from '../api/evaluations';
import { getOrCreateSessionId } from '../utils/session';
import { Button } from '../components/Button';
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
  const [urlsText, setUrlsText] = useState('');
  const [goal, setGoal] = useState(GOALS[0]);
  const [goalDescription, setGoalDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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
        urls,
        goal,
        goalDescription: goalDescription.trim() || undefined,
        anonymousSessionId: session,
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
          <label className={styles.label} htmlFor="urls">URLs (one per line)</label>
          <textarea
            className={styles.control}
            id="urls"
            rows={6}
            placeholder="https://example.com&#10;https://another.com"
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
        <Button className={styles.submit} type="submit" disabled={loading}>
          {loading ? 'Running...' : 'Run Evaluation'}
        </Button>
      </form>
    </Page>
  );
}
