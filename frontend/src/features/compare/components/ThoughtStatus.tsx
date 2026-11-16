import { useState, useId } from 'react';
import styles from './ThoughtStatus.module.css';

export type ThoughtStatusProps = {
  state: 'thinking' | 'done';
  text?: string;
  durationSeconds?: number;
  variant?: 'badge' | 'inline';
  label?: string;
};

export function ThoughtStatus({
  state,
  text,
  durationSeconds,
  variant = 'badge',
  label,
}: ThoughtStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  const defaultLabel =
    state === 'thinking'
      ? 'Думает…'
      : durationSeconds != null
        ? `Думала ${
            variant === 'inline'
              ? new Intl.NumberFormat('ru', {
                  style: 'unit',
                  unit: 'second',
                  unitDisplay: 'long',
                }).format(durationSeconds)
              : `${durationSeconds} с`
          }`
        : 'Готово';

  const displayLabel = label ?? defaultLabel;

  const hasContent = Boolean(text && text.trim().length > 0);

  return (
    <div className={`${styles.container} ${variant === 'inline' ? styles.inline : ''}`}>
      {hasContent ? (
        <button
          type="button"
          className={styles.toggleButton}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen(!isOpen)}
        >
          <img src="/assets/icons/clock.svg" alt="" className={styles.icon} />
          <span>{displayLabel}</span>
          <img
            src="/assets/icons/chevron-down.svg"
            alt=""
            className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          />
        </button>
      ) : (
        <div className={styles.staticBadge}>
          <img src="/assets/icons/clock.svg" alt="" className={styles.icon} />
          <span>{displayLabel}</span>
        </div>
      )}
      {hasContent && isOpen && (
        <div id={contentId} className={styles.thoughtContent}>
          {text}
        </div>
      )}
    </div>
  );
}
