import { useState } from 'react';
import type { CompareAction } from './types';
import { desktopModels, desktopTurns } from './desktopFixtures';
import { CompareTopBar } from './components/CompareTopBar';
import { CompareGrid } from './components/CompareGrid';
import { AddModelColumn } from './components/AddModelColumn';
import { PromptForm } from './components/PromptForm';
import styles from './ComparePage.module.css';

const actionLabels: Record<CompareAction['type'], string> = {
  'share': 'Скопировать ссылку',
  'new-comparison': 'Новое сравнение',
  'add-model': 'Добавить модель',
  'remove-model': 'Удалить модель',
  'retry': 'Повторить запрос',
  'send': 'Отправить сообщение',
};

export function ComparePage() {
  const [promptValue, setPromptValue] = useState('');
  const [demoMessage, setDemoMessage] = useState('');

  const handleAction = (action: CompareAction) => {
    const label = actionLabels[action.type];
    setDemoMessage(`Демо: действие «${label}» пока не подключено.`);
  };

  return (
    <div data-testid="compare-page" className={styles.page}>
      <CompareTopBar
        onShare={() => handleAction({ type: 'share' })}
        onNewComparison={() => handleAction({ type: 'new-comparison' })}
      />

      <main className={styles.container}>
        <div className={styles.bodyGrid}>
          <CompareGrid
            models={desktopModels}
            turns={desktopTurns}
            onAction={handleAction}
          />
          <AddModelColumn onAdd={() => handleAction({ type: 'add-model' })} />
        </div>

        <section className={styles.composerWrapper}>
          <div className={styles.composerInner}>
            <PromptForm
              value={promptValue}
              onValueChange={setPromptValue}
              busy={false}
              onSend={(prompt) => handleAction({ type: 'send', prompt })}
              onStop={() => {
                // Generation is not integrated in FE004
              }}
            />
            <div
              role="status"
              className={styles.demoStatus}
              aria-live="polite"
            >
              {demoMessage}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
