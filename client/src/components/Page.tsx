import type { ReactNode } from 'react';
import styles from './Page.module.css';

export function Page({ children }: { children: ReactNode }) {
  return <div className={styles.page}>{children}</div>;
}

interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headingGroup}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <h2 className={styles.title}>{title}</h2>
        {description && <div className={styles.description}>{description}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}


