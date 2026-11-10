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
    <div className={`${styles.container} ${variant === 'desktop' ? styles.desktop : ''} ${className || ''}`}>
      <img
        src="/assets/icons/alert.svg"
        alt=""
        className={styles.icon}
        width="20"
        height="20"
      />
      <div className={styles.message}>{message}</div>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onRetry} disabled={retryDisabled}>
          <img
            src="/assets/icons/retry.svg"
            className={styles.retryIcon}
            aria-hidden="true"
            width="16"
            height="16"
          />
          <span>Повторить</span>
        </Button>
      </div>
    </div>
  );
}
