import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  title?: string;
  tone?: 'light' | 'dark' | 'orange';
}

export function Panel({ children, title, tone = 'light', className = '', ...props }: PanelProps) {
  return (
    <section className={`${styles.panel} ${tone !== 'light' ? styles[tone] : ''} ${className}`.trim()} {...props}>
      {title && <h3 className={styles.heading}>{title}</h3>}
      {children}
    </section>
  );
}

