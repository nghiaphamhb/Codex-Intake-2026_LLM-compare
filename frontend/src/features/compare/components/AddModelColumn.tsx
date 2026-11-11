import { forwardRef } from 'react';
import styles from './AddModelColumn.module.css';

export type AddModelColumnProps = {
  onAdd: () => void;
};

export const AddModelColumn = forwardRef<HTMLButtonElement, AddModelColumnProps>(
  function AddModelColumn({ onAdd }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={styles.column}
        onClick={onAdd}
        aria-label="Добавить модель"
      >
        <div className={styles.iconCircle} aria-hidden="true">
          <img src="/assets/icons/plus.svg" alt="" className={styles.icon} width="16" height="16" />
        </div>
        <span className={styles.label}>Добавить модель</span>
      </button>
    );
  },
);
