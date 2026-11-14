import { Button } from '../../../components/ui/Button';
import styles from './AnswerError.module.css';

export type AnswerErrorProps = {
  message: string;
  description?: string;
  onRetry: () => void;
  retryDisabled?: boolean;
  className?: string;
  variant?: 'default' | 'desktop';
};

export function AnswerError({
  message,
  description,
  onRetry,
  retryDisabled = false,
  className,
  variant = 'default',
}: AnswerErrorProps) {
  return (
    <div
      className={`${styles.container} ${variant === 'desktop' ? styles.desktop : ''} ${className || ''}`}
    >
      <svg
        className={styles.icon}
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
          strokeWidth="1.5"
          stroke="#F0A35E"
        />
        <path d="M10 6V11" strokeWidth="1.5" strokeLinecap="round" stroke="#F0A35E" />
        <path d="M10 14H10.01" strokeWidth="2" strokeLinecap="round" stroke="#F0A35E" />
      </svg>
      <div className={styles.message}>{message}</div>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onRetry} disabled={retryDisabled}>
          <svg
            className={styles.retryIcon}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M13 8C13.0165 9.15754 12.6308 10.2849 11.9087 11.1898C11.1867 12.0947 10.173 12.721 9.04069 12.9618C7.90836 13.2027 6.72755 13.0431 5.69974 12.5104C4.67192 11.9777 3.86081 11.1049 3.40478 10.0408C2.94876 8.97675 2.87609 7.78743 3.19918 6.67577C3.52227 5.56411 4.22109 4.59901 5.1764 3.94514C6.13172 3.29128 7.28432 2.98916 8.43755 3.09035C9.59077 3.19154 10.6732 3.68976 11.5 4.5"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              stroke="#777777"
            />
            <path
              d="M13 2.5V5.5H10"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              stroke="#777777"
            />
          </svg>
          <span>Повторить</span>
        </Button>
      </div>
    </div>
  );
}
