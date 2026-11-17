import { useId, type CSSProperties } from 'react';
import type { CompareAction, CompareModel, CompareTurn } from '../types';
import { ModelHeader } from './ModelHeader';
import { QuestionBubble } from './QuestionBubble';
import { AnswerCell } from './AnswerCell';
import { MobileModelTabs } from './MobileModelTabs';
import styles from './CompareGrid.module.css';

export type CompareGridProps = {
  models: readonly CompareModel[];
  turns: readonly CompareTurn[];
  onAction: (action: CompareAction) => void;
  className?: string;
  isNarrow?: boolean;
  activeModelId?: string | null;
  onSelectModel?: (modelId: string) => void;
  onAddModel?: (trigger: HTMLButtonElement) => void;
  addDisabled?: boolean;
};

export function CompareGrid({
  models,
  turns,
  onAction,
  className,
  isNarrow = false,
  activeModelId,
  onSelectModel,
  onAddModel,
  addDisabled = false,
}: CompareGridProps) {
  const gridId = useId();
  const gridColumnsStyle = {
    '--model-columns': models.length,
  } as CSSProperties;

  return (
    <div className={`${styles.gridContainer} ${className || ''}`}>
      {/* Sticky Desktop Model Bar */}
      {!isNarrow && (
        <div className={styles.modelBar} style={gridColumnsStyle}>
          {models.map((model, idx) => (
            <div
              key={model.id}
              data-model-id={model.id}
              className={`${styles.modelHeaderCell} ${
                idx > 0 ? styles.modelHeaderCellWithBorder : ''
              }`}
            >
              <ModelHeader
                name={model.name}
                provider={model.provider}
                removeDisabled={models.length <= 2}
                onRemove={() => onAction({ type: 'remove-model', modelId: model.id })}
              />
            </div>
          ))}
        </div>
      )}

      {/* Turn list or Empty state */}
      {turns.length === 0 ? (
        isNarrow ? (
          models.length > 0 ? (
            <>
              <MobileModelTabs
                models={models}
                activeModelId={activeModelId ?? null}
                idPrefix={`${gridId}-empty`}
                answers={{}}
                onSelectModel={onSelectModel ?? (() => {})}
                onAddModel={onAddModel ?? (() => {})}
                addDisabled={addDisabled}
              />
              <div className={styles.emptyPanelsContainer}>
                {models.map((model, index) => {
                  const isActive = model.id === activeModelId;
                  const panelId = `${gridId}-empty-panel-${index}`;
                  const tabId = `${gridId}-empty-tab-${index}`;
                  return (
                    <div
                      key={model.id}
                      id={panelId}
                      role="tabpanel"
                      aria-labelledby={tabId}
                      tabIndex={0}
                      hidden={!isActive}
                      className={styles.emptyTurnPanel}
                    >
                      {isActive && (
                        <>
                          <ModelHeader
                            name={model.name}
                            provider={model.provider}
                            compact
                            removeDisabled={models.length <= 2}
                            onRemove={() => onAction({ type: 'remove-model', modelId: model.id })}
                          />
                          <div className={styles.emptyTurns} role="status">
                            Задайте вопрос, чтобы начать сравнение.
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null
        ) : (
          <div className={styles.emptyTurns} role="status">
            Задайте вопрос, чтобы начать сравнение.
          </div>
        )
      ) : (
        turns.map((turn, turnIdx) => {
          const isFirst = turnIdx === 0;
          const turnPrefix = `${gridId}-${encodeURIComponent(turn.id)}`;

          return (
            <section
              key={turn.id}
              data-turn-id={turn.id}
              className={isFirst ? undefined : styles.turn}
            >
              <div className={isFirst ? styles.firstTurnQuestion : styles.turnQuestion}>
                <div className={styles.questionBubbleWrapper}>
                  <QuestionBubble text={turn.question} />
                </div>
              </div>

              {isNarrow && (
                <MobileModelTabs
                  models={models}
                  activeModelId={activeModelId ?? null}
                  idPrefix={turnPrefix}
                  answers={turn.answers}
                  onSelectModel={onSelectModel ?? (() => {})}
                  onAddModel={onAddModel ?? (() => {})}
                  addDisabled={addDisabled}
                />
              )}

              <div className={styles.answersRow} style={isNarrow ? undefined : gridColumnsStyle}>
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
                    onStop={() =>
                      onAction({
                        type: 'stop',
                        turnId: turn.id,
                        modelId: model.id,
                      })
                    }
                    className={!isNarrow && colIdx > 0 ? styles.cellWithBorder : undefined}
                    panel={
                      isNarrow
                        ? {
                            id: `${turnPrefix}-panel-${colIdx}`,
                            labelledBy: `${turnPrefix}-tab-${colIdx}`,
                            hidden: model.id !== activeModelId,
                          }
                        : undefined
                    }
                    mobileModelControls={
                      isNarrow
                        ? {
                            onRemove: () => onAction({ type: 'remove-model', modelId: model.id }),
                            removeDisabled: models.length <= 2,
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
