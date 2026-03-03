import type { Variant } from '../types';
import { ScoreBar } from './ScoreBar';
import { useNavigate } from 'react-router-dom';

interface VariantCardProps {
  variant: Variant;
  evaluationId: string;
}

export function VariantCard({ variant, evaluationId }: VariantCardProps) {
  const navigate = useNavigate();

  return (
    <div className="variant-card">
      <div className="variant-card__header">
        <span className="variant-card__rank">#{variant.rank}</span>
        <a href={variant.url} target="_blank" rel="noopener noreferrer" className="variant-card__url">
          {variant.url}
        </a>
        <span className="variant-card__score">{variant.totalScore.toFixed(1)}</span>
      </div>
      <div className="variant-card__scores">
        {Object.entries(variant.categoryScores).map(([key, val]) => (
          <ScoreBar key={key} label={key} score={val} />
        ))}
      </div>
      {variant.topDrivers.length > 0 && (
        <div className="variant-card__drivers">
          <h4>Top Drivers</h4>
          <ul>
            {variant.topDrivers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        className="btn btn--secondary"
        onClick={() => navigate(`/results/${evaluationId}/variant/${variant.id}`)}
      >
        View Details
      </button>
    </div>
  );
}
