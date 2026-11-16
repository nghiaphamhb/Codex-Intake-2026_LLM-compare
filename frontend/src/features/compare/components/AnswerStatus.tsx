import styles from './AnswerStatus.module.css';

export type AnswerStatusProps = {
  state: 'waiting' | 'generating';
  label?: string;
};

export function AnswerStatus({ state, label: customLabel }: AnswerStatusProps) {
  const isWaiting = state === 'waiting';
  const defaultLabel = isWaiting ? 'Ждём ответ…' : 'Печатает…';
  const label = customLabel ?? defaultLabel;

  return (
    <div className={styles.container}>
      <div className={styles.labelWrapper} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <span>{label}</span>
      </div>
      {isWaiting && (
        <div className={styles.skeletonWrapper} aria-hidden="true">
          <div className={`${styles.skeletonLine} ${styles.line1}`} data-testid="skeleton-line" />
          <div className={`${styles.skeletonLine} ${styles.line2}`} data-testid="skeleton-line" />
          <div className={`${styles.skeletonLine} ${styles.line3}`} data-testid="skeleton-line" />
        </div>
      )}
    </div>
  );
}
