import { useEffect, useRef } from 'react';
import type { CompareModel, CompareTurn, ResultAnswer } from '../types';
import styles from './MobileModelTabs.module.css';

export type MobileModelTabsProps = {
  models: readonly CompareModel[];
  activeModelId: string | null;
  idPrefix: string;
  answers: CompareTurn['answers'];
  onSelectModel: (modelId: string) => void;
  onAddModel: (trigger: HTMLButtonElement) => void;
  addDisabled?: boolean;
};

function getStatusLabel(hasAnswers: boolean, answer: ResultAnswer | undefined): string | null {
  if (!hasAnswers) return null;
  if (!answer) return 'Нет ответа';
  switch (answer.state) {
    case 'pending':
      return 'Ждём…';
    case 'streaming':
      return 'Получаем…';
    case 'success':
      return answer.durationLabel || null;
    case 'error':
      return 'Ошибка';
    case 'stopped':
      return 'Остановлено';
    default:
      return null;
  }
}

export function MobileModelTabs({
  models,
  activeModelId,
  idPrefix,
  answers,
  onSelectModel,
  onAddModel,
  addDisabled = false,
}: MobileModelTabsProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasAnswers = Object.keys(answers).length > 0;

  useEffect(() => {
    if (!activeModelId) return;
    const strip = stripRef.current;
    const tabEl = tabRefs.current[activeModelId];
    if (strip && tabEl) {
      const stripRect = strip.getBoundingClientRect();
      const tabRect = tabEl.getBoundingClientRect();
      if (tabRect.left < stripRect.left) {
        strip.scrollLeft -= stripRect.left - tabRect.left + 8;
      } else if (tabRect.right > stripRect.right) {
        strip.scrollLeft += tabRect.right - stripRect.right + 8;
      }
    }
  }, [activeModelId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % models.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + models.length) % models.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = models.length - 1;
    }

    if (nextIndex >= 0) {
      e.preventDefault();
      const nextModel = models[nextIndex];
      onSelectModel(nextModel.id);
      tabRefs.current[nextModel.id]?.focus();
    }
  };

  return (
    <div className={styles.toolbar} role="region" aria-label="Панель переключения моделей">
      <div
        ref={stripRef}
        role="tablist"
        aria-label="Модели для сравнения"
        aria-orientation="horizontal"
        className={styles.tablist}
      >
        {models.map((model, index) => {
          const isActive = model.id === activeModelId;
          const tabId = `${idPrefix}-tab-${index}`;
          const panelId = `${idPrefix}-panel-${index}`;
          const answer = answers[model.id];
          const status = getStatusLabel(hasAnswers, answer);

          return (
            <button
              key={`${model.id}-${index}`}
              ref={(el) => {
                tabRefs.current[model.id] = el;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              aria-label={`${model.name} (${model.provider})`}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onSelectModel(model.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              title={`${model.name} (${model.provider})`}
            >
              <span className={styles.tabName}>{model.name}</span>
              {status ? (
                <span className={styles.tabStatus} aria-hidden="true">
                  {status}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={styles.addButton}
        onClick={(e) => onAddModel(e.currentTarget)}
        disabled={addDisabled}
        aria-label="Добавить модель"
      >
        <img
          src="/assets/icons/plus.svg"
          alt=""
          width="16"
          height="16"
          className={styles.addIcon}
        />
      </button>
    </div>
  );
}
