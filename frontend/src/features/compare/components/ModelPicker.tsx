import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { TextInput } from '../../../components/ui/TextInput';
import type { CompareModel } from '../types';
import styles from './ModelPicker.module.css';

export type ModelPickerProps = {
  catalog: readonly CompareModel[];
  selectedModelIds: readonly string[];
  onSelect: (modelId: string) => void;
  onClose: () => void;
};

export function ModelPicker({ catalog, selectedModelIds, onSelect, onClose }: ModelPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    }

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    dialog.addEventListener('cancel', handleCancel);

    // Initial focus on search input
    const input = dialog.querySelector('input');
    input?.focus();

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      if (typeof dialog.close === 'function' && dialog.open) {
        dialog.close();
      }
    };
  }, [onClose]);

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const isMaxModelsReached = selectedModelIds.length >= 4;

  const filteredCatalog = catalog.filter((model) => {
    if (!trimmedQuery) return true;
    return (
      model.name.toLowerCase().includes(trimmedQuery) ||
      model.provider.toLowerCase().includes(trimmedQuery)
    );
  });

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="model-picker-title">
      <div className={styles.header}>
        <h2 id="model-picker-title" className={styles.title}>
          Добавить модель
        </h2>
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      </div>

      <div className={styles.searchWrapper}>
        <TextInput
          label="Поиск модели"
          placeholder="Поиск модели"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.modelList}>
        {filteredCatalog.length === 0 ? (
          <p className={styles.empty}>Модели не найдены.</p>
        ) : (
          filteredCatalog.map((model) => {
            const isAlreadySelected = selectedModelIds.includes(model.id);
            const isDisabled = isAlreadySelected || (isMaxModelsReached && !isAlreadySelected);

            let statusTag: string | null = null;
            if (isAlreadySelected) {
              statusTag = 'Уже добавлена';
            } else if (isMaxModelsReached) {
              statusTag = 'Можно выбрать не более 4 моделей';
            }

            return (
              <button
                type="button"
                key={model.id}
                className={styles.modelItem}
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) {
                    onSelect(model.id);
                  }
                }}
              >
                <div className={styles.modelInfo}>
                  <span className={styles.modelName}>{model.name}</span>
                  <span className={styles.modelProvider}>{model.provider}</span>
                </div>
                {statusTag && <span className={styles.statusTag}>{statusTag}</span>}
              </button>
            );
          })
        )}
      </div>
    </dialog>
  );
}
