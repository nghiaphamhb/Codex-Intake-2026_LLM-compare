import type { ButtonHTMLAttributes } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  iconSrc: string;
}

export function IconButton({
  type = 'button',
  label,
  iconSrc,
  className,
  ...props
}: IconButtonProps) {
  const combinedClassName = className ? `${styles.iconButton} ${className}` : styles.iconButton;

  return (
    <button
      type={type}
      aria-label={label}
      className={combinedClassName}
      {...props}
    >
      <img src={iconSrc} alt="" className={styles.icon} />
    </button>
  );
}

