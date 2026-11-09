import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  children?: ReactNode;
}

export function Button({
  type = 'button',
  variant = 'secondary',
  className,
  children,
  ...props
}: ButtonProps) {
  const variantClass = variant === 'primary' ? styles.primary : styles.secondary;
  const combinedClassName = className ? `${styles.button} ${variantClass} ${className}` : `${styles.button} ${variantClass}`;

  return (
    <button type={type} className={combinedClassName} {...props}>
      {children}
    </button>
  );
}

