import { useEffect, useId } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import styles from './SquishSwitch.module.css';

interface SquishSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  offLabel: string;
  onLabel: string;
  disabled?: boolean;
}

export function SquishSwitch({ checked, onChange, offLabel, onLabel, disabled = false }: SquishSwitchProps) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const x = useMotionValue(checked ? 23 : 3);
  useEffect(() => {
    if (reducedMotion) x.jump(checked ? 23 : 3);
    else animate(x, checked ? 23 : 3, { type: 'spring', stiffness: 420, damping: 28, mass: 0.6 });
  }, [checked, reducedMotion, x]);

  return (
    <div className={styles.root}>
      <label className={styles.stateLabel} htmlFor={id}>{offLabel}</label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={styles.switch}
        data-checked={checked || undefined}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.track}>
          <motion.span
            className={styles.thumb}
            style={{ x }}
            whileHover={reducedMotion ? undefined : { scale: 1.06 }}
            whileTap={reducedMotion ? undefined : { scaleX: 1.25, scaleY: 0.82 }}
          />
        </span>
      </button>
      <label className={styles.stateLabel} htmlFor={id}>{onLabel}</label>
    </div>
  );
}
