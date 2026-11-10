import { Button } from '../../../components/ui/Button';
import styles from './CompareTopBar.module.css';

export type CompareTopBarProps = {
  onShare: () => void;
  onNewComparison: () => void;
};

export function CompareTopBar({ onShare, onNewComparison }: CompareTopBarProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <img
            src="/assets/icons/logo.svg"
            alt=""
            className={styles.logo}
            width="20"
            height="20"
          />
          <h1 className={styles.title}>LLM Compare</h1>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onShare}>
            <img
              src="/assets/icons/link.svg"
              alt=""
              className={styles.buttonIcon}
              width="16"
              height="16"
            />
            <span>Скопировать ссылку</span>
          </Button>
          <Button variant="primary" onClick={onNewComparison}>
            Новое сравнение
          </Button>
        </div>
      </div>
    </header>
  );
}

