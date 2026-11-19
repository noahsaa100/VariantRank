import styles from './ScoreBar.module.css';

interface ScoreBarProps {
  label: string;
  score: number;
  max?: number;
  tone?: 'dark' | 'light';
}

function getTone(score: number, max: number): 'good' | 'warn' | 'bad' {
  const pct = (score / max) * 100;
  if (pct >= 70) return 'good';
  if (pct >= 45) return 'warn';
  return 'bad';
}

export function ScoreBar({ label, score, max = 100, tone: surfaceTone = 'dark' }: ScoreBarProps) {
  const safeScore = Math.max(0, Math.min(score, max));
  const tone = getTone(safeScore, max);

  return (
    <div className={`${styles.scoreBar} ${surfaceTone === 'light' ? styles.light : ''}`}>
      <div className={styles.header}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{safeScore.toFixed(1)}</span>
      </div>
      <progress
        className={`${styles.progress} ${styles[tone]}`}
        max={max}
        value={safeScore}
      />
    </div>
  );
}
