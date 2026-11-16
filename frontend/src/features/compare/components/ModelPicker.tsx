import { useEffect, useLayoutEffect, useId, useRef, useState, type RefObject } from 'react';
import { TextInput } from '../../../components/ui/TextInput';
import type { CompareModel } from '../types';
import styles from './ModelPicker.module.css';

const closeIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M4 4L8 8M8 8L12 12M8 8L12 4M8 8L4 12"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke="white"
    />
  </svg>
);
const searchIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M11.5 7C11.5 9.48528 9.48528 11.5 7 11.5C4.51472 11.5 2.5 9.48528 2.5 7C2.5 4.51472 4.51472 2.5 7 2.5C9.48528 2.5 11.5 4.51472 11.5 7Z"
      strokeWidth="1.4"
      stroke="#777777"
    />
    <path
      d="M10.5 10.5L14 14"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke="#777777"
    />
  </svg>
);
const plusIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M8 3V8M8 8V13M8 8H3M8 8H13"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      stroke="white"
    />
  </svg>
);

export type ModelPickerProps = {
  catalog: readonly CompareModel[];
  selectedModelIds: readonly string[];
  onSelect: (modelId: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLButtonElement | null>;
};

export function ModelPicker({
  catalog,
  selectedModelIds,
  onSelect,
  onClose,
  anchorRef,
}: ModelPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const descriptionId = useId();
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const position = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetX = viewport?.offsetLeft ?? 0;
      const offsetY = viewport?.offsetTop ?? 0;
      dialog.style.maxHeight = Math.max(0, height - 32) + 'px';
      dialog.style.width = Math.max(0, Math.min(360, width - 32)) + 'px';
      const rect = dialog.getBoundingClientRect();
      const anchor = anchorRef?.current;
      const button = anchor?.getBoundingClientRect();
      const label = anchor?.querySelector('span')?.getBoundingClientRect();
      const desiredTop = button
        ? (label?.bottom ?? button.top) + 12
        : offsetY + (height - rect.height) / 2;
      const top =
        desiredTop + rect.height > offsetY + height - 16 &&
        button &&
        button.top - rect.height - 12 >= offsetY + 16
          ? button.top - rect.height - 12
          : desiredTop;
      dialog.style.left =
        Math.max(
          offsetX + 16,
          Math.min(
            button ? button.right - rect.width : offsetX + (width - rect.width) / 2,
            offsetX + width - rect.width - 16,
          ),
        ) + 'px';
      dialog.style.top =
        Math.max(offsetY + 16, Math.min(top, offsetY + height - rect.height - 16)) + 'px';
    };
    position();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(position);
    observer?.observe(dialog);
    if (anchorRef?.current) observer?.observe(anchorRef.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [anchorRef]);

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
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="model-picker-title"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      <div className={styles.header}>
        <h2 id="model-picker-title" className={styles.title}>
          Добавить модель
        </h2>
        <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
          {closeIcon}
        </button>
      </div>

      <div className={styles.searchWrapper}>
        {searchIcon}
        <TextInput
          className={styles.search}
          label="Поиск модели"
          placeholder="Найти модель"
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
                aria-describedby={statusTag ? descriptionId + model.id : undefined}
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
                <span className={styles.plus}>{plusIcon}</span>
                {statusTag && (
                  <span id={descriptionId + model.id} className={styles.statusTag}>
                    {statusTag}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
      <p className={styles.footer}>В сравнении может быть до 4 моделей</p>
    </dialog>
  );
}
