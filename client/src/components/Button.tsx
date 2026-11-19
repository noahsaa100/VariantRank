import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { SpecularEffect } from './SpecularEffect';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'default' | 'small';

function buttonClassName(variant: ButtonVariant = 'primary', size: ButtonSize = 'default'): string {
  return [styles.button, styles[variant], size === 'small' ? styles.small : ''].filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size = 'default', className = '', ...props }: ButtonProps) {
  const { children, ...buttonProps } = props;
  return (
    <button className={`${buttonClassName(variant, size)} ${className}`.trim()} {...buttonProps}>
      <SpecularEffect idleIntensity={variant === 'secondary' ? 0.08 : 0.22} />
      <span className={styles.label}>{children}</span>
      {variant !== 'danger' && <span aria-hidden="true" className={styles.arrow} />}
    </button>
  );
}

interface ButtonLinkProps extends LinkProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ children, variant = 'primary', size = 'default', className = '', ...props }: ButtonLinkProps) {
  return (
    <Link className={`${buttonClassName(variant, size)} ${className}`.trim()} {...props}>
      <SpecularEffect idleIntensity={variant === 'secondary' ? 0.08 : 0.22} />
      <span className={styles.label}>{children}</span>
      {variant !== 'danger' && <span aria-hidden="true" className={styles.arrow} />}
    </Link>
  );
}

