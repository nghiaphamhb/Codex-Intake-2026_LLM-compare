import { Button } from '../../../components/ui/Button';
import styles from './AnswerError.module.css';

export type AnswerErrorProps = {
  message: string;
  description?: string;
  onRetry: () => void;
  retryDisabled?: boolean;
};

export function AnswerError({
  message,
  description,
  onRetry,
  retryDisabled = false,
}: AnswerErrorProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <img src="/assets/icons/alert.svg" alt="" className={styles.icon} />
        <span className={styles.message}>{message}</span>
      </div>
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onRetry} disabled={retryDisabled}>
          Повторить
        </Button>
      </div>
    </div>
  );
}

