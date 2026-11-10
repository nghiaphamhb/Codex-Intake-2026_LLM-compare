import type { CompareModel, ResultAnswer } from '../types';
import { AnswerContent } from './AnswerContent';
import { AnswerError } from './AnswerError';
import { ThoughtStatus } from './ThoughtStatus';
import styles from './AnswerCell.module.css';

export type AnswerCellProps = {
  model: CompareModel;
  turnId: string;
  answer: ResultAnswer | undefined;
  onRetry: () => void;
  className?: string;
};

export function AnswerCell({
  model,
  turnId,
  answer,
  onRetry,
  className,
}: AnswerCellProps) {
  const cellId = `cell-${model.id}-${turnId}`;

  if (!answer) {
    return (
      <div
        className={`${styles.cell} ${className || ''}`}
        aria-label={`Нет ответа: ${model.name}`}
        data-testid={cellId}
      />
    );
  }

  return (
    <div
      className={`${styles.cell} ${className || ''}`}
      aria-label={`${model.name}, ${turnId}`}
      data-testid={cellId}
    >
      {answer.state === 'success' && (
        <>
          {answer.thought && (
            <ThoughtStatus
              state="done"
              variant="inline"
              durationSeconds={answer.thought.durationSeconds}
              text={answer.thought.text}
            />
          )}
          <AnswerContent markdown={answer.markdown} className={styles.desktopContent} />
          <div className={styles.metadata}>
            {answer.durationLabel} · {answer.costLabel}
          </div>
        </>
      )}

      {answer.state === 'error' && (
        <AnswerError
          variant="desktop"
          message={answer.message}
          description={answer.description}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}

