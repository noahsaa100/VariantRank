import type { Variant } from '../types';
import { ScoreBar } from './ScoreBar';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import styles from './VariantCard.module.css';
import { humanizeFinding } from '../utils/findings';

interface VariantCardProps {
  variant: Variant;
  evaluationId: string;
  onViewDetails?: () => void;
}

export function VariantCard({ variant, evaluationId, onViewDetails }: VariantCardProps) {
  const navigate = useNavigate();

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={styles.rank}>#{variant.rank}</span>
        <a href={variant.url} target="_blank" rel="noopener noreferrer" className={styles.url}>
          {variant.url}
        </a>
        <span className={styles.score}>{variant.totalScore.toFixed(1)}</span>
      </div>
      <div className={styles.scores}>
        {Object.entries(variant.categoryScores).map(([key, val]) => (
          <ScoreBar key={key} label={key} score={val} />
        ))}
      </div>
      {variant.topDrivers.length > 0 && (
        <div className={styles.drivers}>
          <h4>Top Drivers</h4>
          <ul>
            {variant.topDrivers.map((d) => (
              <li key={d}>{humanizeFinding(d)}</li>
            ))}
          </ul>
        </div>
      )}
      <Button
        className={styles.action}
        variant="primary"
        onClick={onViewDetails ?? (() => navigate(`/results/${evaluationId}/variant/${variant.id}`))}
      >
        View Details
      </Button>
    </article>
  );
}
