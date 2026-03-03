import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEvaluation } from '../api/evaluations';
import { getOrCreateSessionId } from '../utils/session';

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
      const evaluation = await createEvaluation({ urls, goal, anonymousSessionId: session });
      navigate(`/results/${evaluation.id}`);
    } catch (err) {
      setError('Failed to run evaluation. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>New Evaluation</h1>
      <form className="eval-form" onSubmit={handleSubmit}>
        <label htmlFor="urls">URLs (one per line)</label>
        <textarea
          id="urls"
          rows={6}
          placeholder="https://example.com&#10;https://another.com"
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
        />
        <label htmlFor="goal">Goal</label>
        <select id="goal" value={goal} onChange={(e) => setGoal(e.target.value)}>
          {GOALS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {error && <p className="error">{error}</p>}
        <button className="btn btn--primary" type="submit" disabled={loading}>
          {loading ? 'Running…' : 'Run Evaluation'}
        </button>
      </form>
    </div>
  );
}
