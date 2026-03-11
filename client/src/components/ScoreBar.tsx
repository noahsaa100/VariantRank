interface ScoreBarProps {
  label: string;
  score: number;
  max?: number;
}

function getTone(score: number, max: number): 'good' | 'warn' | 'bad' {
  const pct = (score / max) * 100;
  if (pct >= 70) return 'good';
  if (pct >= 45) return 'warn';
  return 'bad';
}

export function ScoreBar({ label, score, max = 100 }: ScoreBarProps) {
  const safeScore = Math.max(0, Math.min(score, max));
  const tone = getTone(safeScore, max);

  return (
    <div className="score-bar">
      <div className="score-bar__header">
        <span className="score-bar__label">{label}</span>
        <span className="score-bar__value">{safeScore.toFixed(1)}</span>
      </div>
      <progress
        className={`score-bar__progress score-bar__progress--${tone}`}
        max={max}
        value={safeScore}
      />
    </div>
  );
}
