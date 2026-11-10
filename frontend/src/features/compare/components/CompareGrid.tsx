import type { CSSProperties } from 'react';
import type { CompareAction, CompareModel, CompareTurn } from '../types';
import { ModelHeader } from './ModelHeader';
import { QuestionBubble } from './QuestionBubble';
import { AnswerCell } from './AnswerCell';
import styles from './CompareGrid.module.css';

export type CompareGridProps = {
  models: readonly CompareModel[];
  turns: readonly CompareTurn[];
  onAction: (action: CompareAction) => void;
  className?: string;
};

export function CompareGrid({
  models,
  turns,
  onAction,
  className,
}: CompareGridProps) {
  const gridColumnsStyle = {
    '--model-columns': models.length,
  } as CSSProperties;

  return (
    <div className={`${styles.gridContainer} ${className || ''}`}>
      {/* Sticky Model Bar */}
      <div className={styles.modelBar} style={gridColumnsStyle}>
        {models.map((model, idx) => (
          <div
            key={model.id}
            className={`${styles.modelHeaderCell} ${
              idx > 0 ? styles.modelHeaderCellWithBorder : ''
            }`}
          >
            <ModelHeader
              name={model.name}
              provider={model.provider}
              onRemove={() =>
                onAction({ type: 'remove-model', modelId: model.id })
              }
            />
          </div>
        ))}
      </div>

      {/* Turn list */}
      {turns.map((turn, turnIdx) => {
        const isFirst = turnIdx === 0;
        return (
          <section
            key={turn.id}
            className={isFirst ? undefined : styles.turn}
          >
            <div
              className={
                isFirst ? styles.firstTurnQuestion : styles.turnQuestion
              }
            >
              <div className={styles.questionBubbleWrapper}>
                <QuestionBubble text={turn.question} />
              </div>
            </div>

            <div className={styles.answersRow} style={gridColumnsStyle}>
              {models.map((model, colIdx) => (
                <AnswerCell
                  key={model.id}
                  model={model}
                  turnId={turn.id}
                  answer={turn.answers[model.id]}
                  onRetry={() =>
                    onAction({
                      type: 'retry',
                      turnId: turn.id,
                      modelId: model.id,
                    })
                  }
                  className={colIdx > 0 ? styles.cellWithBorder : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

