import { IconButton } from '../../../components/ui/IconButton';
import styles from './ModelHeader.module.css';

export type ModelHeaderProps = {
  name: string;
  provider: string;
  onRemove?: () => void;
  removeDisabled?: boolean;
  className?: string;
  compact?: boolean;
};

export function ModelHeader({
  name,
  provider,
  onRemove,
  removeDisabled = false,
  className,
  compact = false,
}: ModelHeaderProps) {
  return (
    <div className={`${styles.header} ${compact ? styles.compact : ''} ${className || ''}`}>
      <div className={styles.info}>
        <span className={styles.name} title={name}>
          {name}
        </span>
        <span className={styles.provider} title={provider}>
          {provider}
        </span>
      </div>
      {onRemove && (
        <div className={styles.removeButton}>
          <IconButton
            label={removeDisabled ? 'Нужно оставить минимум 2 модели' : `Удалить модель ${name}`}
            iconSrc="/assets/icons/close.svg"
            onClick={onRemove}
            disabled={removeDisabled}
            className={styles.closeIconButton}
          />
        </div>
      )}
    </div>
  );
}
