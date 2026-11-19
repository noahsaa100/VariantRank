import { useEffect, useRef } from 'react';
import styles from './SpecularEffect.module.css';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function SpecularEffect({ idleIntensity = 0.22, proximity = 220 }: { idleIntensity?: number; proximity?: number }) {
  const effectRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const effect = effectRef.current;
    const host = effect?.parentElement;
    if (!effect || !host) return;

    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerKnown = false;

    const paint = () => {
      frame = 0;
      const rect = host.getBoundingClientRect();
      const x = pointerKnown ? pointerX - rect.left : rect.width * 0.18;
      const y = pointerKnown ? pointerY - rect.top : 0;
      const distance = Math.hypot(Math.max(-x, x - rect.width, 0), Math.max(-y, y - rect.height, 0));
      const near = pointerKnown ? clamp(1 - distance / proximity, 0, 1) : 0;
      const intensity = idleIntensity + (1 - idleIntensity) * near * near * (3 - 2 * near);
      effect.style.setProperty('--specular-x', `${clamp(x, 0, rect.width)}px`);
      effect.style.setProperty('--specular-y', `${clamp(y, 0, rect.height)}px`);
      effect.style.setProperty('--specular-intensity', intensity.toFixed(3));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerKnown = true;
      schedule();
    };
    const onPointerLeave = () => {
      pointerKnown = false;
      schedule();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    paint();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [idleIntensity, proximity]);

  return <span aria-hidden="true" className={styles.effect} ref={effectRef} />;
}

