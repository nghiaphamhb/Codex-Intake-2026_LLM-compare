import { useRef, useLayoutEffect } from 'react';
import type { CompareModel, ResultAnswer } from '../types.js';
import { AnswerContent } from './AnswerContent.js';
import { AnswerError } from './AnswerError.js';
import { AnswerStatus } from './AnswerStatus.js';
import { ThoughtStatus } from './ThoughtStatus.js';
import { ModelHeader } from './ModelHeader.js';
import { Button } from '../../../components/ui/Button.js';
import styles from './AnswerCell.module.css';

export type AnswerCellProps = {
  model: CompareModel;
  turnId: string;
  answer: ResultAnswer | undefined;
  onRetry: () => void;
  onStop?: () => void;
  className?: string;
  panel?: {
    id: string;
    labelledBy: string;
    hidden: boolean;
  };
  mobileModelControls?: {
    onRemove: () => void;
    removeDisabled: boolean;
  };
};

export function AnswerCell({
  model,
  turnId,
  answer,
  onRetry,
  onStop,
  className,
  panel,
  mobileModelControls,
}: AnswerCellProps) {
  const cellId = `cell-${model.id}-${turnId}`;
  const isBusy = answer?.state === 'pending' || answer?.state === 'streaming';

  const cellRef = useRef<HTMLDivElement>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const stopHadFocusRef = useRef(false);
  const prevStateRef = useRef<string | undefined>(undefined);

  if (panel?.hidden) {
    stopHadFocusRef.current = false;
  } else if (stopButtonRef.current && document.activeElement === stopButtonRef.current) {
    stopHadFocusRef.current = true;
  }

  useLayoutEffect(() => {
    const prevState = prevStateRef.current;
    const currentState = answer?.state;
    prevStateRef.current = currentState;

    if (panel?.hidden) {
      stopHadFocusRef.current = false;
      return;
    }

    if (
      (prevState === 'pending' || prevState === 'streaming') &&
      (currentState === 'stopped' || currentState === 'error')
    ) {
      if (stopHadFocusRef.current) {
        stopHadFocusRef.current = false;
        const retryBtn = cellRef.current?.querySelector<HTMLButtonElement>(
          'button[data-action="retry"]',
        );
        retryBtn?.focus();
      }
    } else if (
      (prevState === 'pending' || prevState === 'streaming') &&
      currentState === 'success'
    ) {
      if (stopHadFocusRef.current) {
        stopHadFocusRef.current = false;
        document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      }
    } else if (!isBusy) {
      stopHadFocusRef.current = false;
    }
  }, [answer?.state, isBusy, panel?.hidden]);

  const costDescription =
    answer?.state === 'success' && answer.costLabel
      ? `Оценочная стоимость: ${answer.costLabel}. Стандартные тарифы; кэш и специальные тарифы не учтены.`
      : undefined;

  const panelProps = panel
    ? {
        id: panel.id,
        role: 'tabpanel',
        'aria-labelledby': panel.labelledBy,
        tabIndex: 0,
        hidden: panel.hidden,
      }
    : {};

  if (!answer) {
    return (
      <div
        className={`${styles.cell} ${className || ''}`}
        aria-label={`Нет ответа: ${model.name}`}
        data-testid={cellId}
        {...panelProps}
      >
        {mobileModelControls && (
          <div className={styles.mobileModelHeader}>
            <ModelHeader
              compact
              name={model.name}
              provider={model.provider}
              removeDisabled={mobileModelControls.removeDisabled}
              onRemove={mobileModelControls.onRemove}
            />
          </div>
        )}
        <div className={styles.missingPlaceholder}>Модель добавлена после этого вопроса.</div>
      </div>
    );
  }

  const reasoningText =
    answer.state === 'success'
      ? answer.thought?.text
      : 'reasoning' in answer
        ? answer.reasoning
        : undefined;
  const hasReasoning = Boolean(reasoningText && reasoningText.trim().length > 0);

  const markdownText =
    answer.state === 'streaming' ||
    answer.state === 'success' ||
    answer.state === 'stopped' ||
    answer.state === 'error'
      ? answer.markdown
      : undefined;
  const hasMarkdown = Boolean(markdownText && markdownText.length > 0);

  return (
    <div
      ref={cellRef}
      className={`${styles.cell} ${className || ''}`}
      aria-label={`${model.name}, ${turnId}`}
      aria-busy={isBusy}
      data-testid={cellId}
      {...panelProps}
    >
      {mobileModelControls && (
        <div className={styles.mobileModelHeader}>
          <ModelHeader
            compact
            name={model.name}
            provider={model.provider}
            removeDisabled={mobileModelControls.removeDisabled}
            onRemove={mobileModelControls.onRemove}
          />
        </div>
      )}

      {mobileModelControls && answer.state === 'success' && (
        <div className={styles.metadata}>
          {answer.durationLabel}
          {answer.costLabel && (
            <>
              {' · '}
              <span title={costDescription} aria-label={costDescription}>
                {answer.costLabel}
              </span>
            </>
          )}
        </div>
      )}

      {hasReasoning && (
        <ThoughtStatus
          key={answer.requestId}
          state="done"
          variant="inline"
          label={
            answer.state === 'success' && answer.thought?.durationSeconds != null
              ? undefined
              : 'Рассуждения'
          }
          durationSeconds={answer.state === 'success' ? answer.thought?.durationSeconds : undefined}
          text={reasoningText}
        />
      )}

      {hasMarkdown && <AnswerContent markdown={markdownText!} className={styles.desktopContent} />}

      {isBusy && (
        <>
          <AnswerStatus
            state={answer.state === 'pending' ? 'waiting' : 'generating'}
            label={answer.state === 'streaming' && !hasMarkdown ? 'Получаем ответ…' : undefined}
          />
          <button
            ref={stopButtonRef}
            type="button"
            className={styles.cellStopButton}
            aria-label={`Остановить ответ: ${model.name}`}
            onClick={onStop}
            onFocus={() => {
              if (!panel?.hidden) stopHadFocusRef.current = true;
            }}
            onBlur={() => {
              stopHadFocusRef.current = false;
            }}
          >
            <img src="/assets/icons/stop.svg" alt="" className={styles.stopIcon} />
            <span>Остановить</span>
          </button>
        </>
      )}

      {!mobileModelControls && answer.state === 'success' && (
        <div className={styles.metadata}>
          {answer.durationLabel}
          {answer.costLabel && (
            <>
              {' · '}
              <span title={costDescription} aria-label={costDescription}>
                {answer.costLabel}
              </span>
            </>
          )}
        </div>
      )}

      {answer.state === 'error' && (
        <AnswerError
          variant="desktop"
          message={answer.message}
          description={answer.description}
          onRetry={onRetry}
        />
      )}

      {answer.state === 'stopped' && (
        <div className={styles.stoppedContainer}>
          <div role="status" className={styles.stoppedStatus} aria-live="polite">
            Генерация остановлена.
          </div>
          <Button variant="secondary" onClick={onRetry} data-action="retry">
            <span>Повторить</span>
          </Button>
        </div>
      )}
    </div>
  );
}
