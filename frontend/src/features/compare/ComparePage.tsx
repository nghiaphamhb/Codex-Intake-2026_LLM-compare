import { useEffect, useReducer, useRef, useState } from 'react';
import type { CompareAction } from './types';
import { comparisonReducer, createInitialComparisonState, validatePrompt } from './comparisonState';
import { mockModelCatalog } from './mockComparison';
import { CompareTopBar } from './components/CompareTopBar';
import { CompareGrid } from './components/CompareGrid';
import { AddModelColumn } from './components/AddModelColumn';
import { PromptForm } from './components/PromptForm';
import { ModelPicker } from './components/ModelPicker';
import styles from './ComparePage.module.css';

export function ComparePage() {
  const [state, dispatch] = useReducer(comparisonReducer, undefined, createInitialComparisonState);
  const [promptValue, setPromptValue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [promptError, setPromptError] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const addModelBtnRef = useRef<HTMLButtonElement>(null);
  const pickerWasOpen = useRef(false);

  useEffect(() => {
    // Background controls become focusable after the modal has unmounted.
    if (pickerWasOpen.current && !isPickerOpen) addModelBtnRef.current?.focus();
    pickerWasOpen.current = isPickerOpen;
  }, [isPickerOpen]);

  const handleSend = (prompt: string) => {
    const error = validatePrompt(prompt);
    if (error) {
      setPromptError(error);
      return;
    }

    const turnId = crypto.randomUUID();
    dispatch({ type: 'send', turnId, prompt });
    setPromptValue('');
    setPromptError('');
    setStatusMessage('');
    promptInputRef.current?.focus();
  };

  const handleAction = (action: CompareAction) => {
    switch (action.type) {
      case 'share': {
        setStatusMessage('Общий доступ пока не поддерживается.');
        break;
      }
      case 'new-comparison': {
        dispatch({ type: 'new-comparison' });
        setPromptValue('');
        setPromptError('');
        setStatusMessage('');
        setIsPickerOpen(false);
        promptInputRef.current?.focus();
        break;
      }
      case 'add-model': {
        setIsPickerOpen(true);
        break;
      }
      case 'remove-model': {
        dispatch({ type: 'remove-model', modelId: action.modelId });
        promptInputRef.current?.focus();
        break;
      }
      case 'retry': {
        dispatch({
          type: 'retry',
          turnId: action.turnId,
          modelId: action.modelId,
        });
        break;
      }
      case 'send': {
        handleSend(action.prompt);
        break;
      }
    }
  };

  const handleSelectModel = (modelId: string) => {
    dispatch({ type: 'select-model', modelId });
    setIsPickerOpen(false);
  };

  const handleClosePicker = () => {
    setIsPickerOpen(false);
  };

  return (
    <div data-testid="compare-page" className={styles.page}>
      <CompareTopBar
        onShare={() => handleAction({ type: 'share' })}
        onNewComparison={() => handleAction({ type: 'new-comparison' })}
      />

      <main className={styles.container}>
        <div className={styles.bodyGrid}>
          <CompareGrid models={state.models} turns={state.turns} onAction={handleAction} />
          <AddModelColumn ref={addModelBtnRef} onAdd={() => handleAction({ type: 'add-model' })} />
        </div>

        <section className={styles.composerWrapper}>
          <div className={styles.composerInner}>
            <PromptForm
              value={promptValue}
              onValueChange={(val) => {
                setPromptValue(val);
                setPromptError('');
                if (statusMessage) setStatusMessage('');
              }}
              busy={false}
              onSend={handleSend}
              onStop={() => {}}
              inputRef={promptInputRef}
              error={promptError}
            />
            <div role="status" className={styles.demoStatus} aria-live="polite">
              {statusMessage}
            </div>
          </div>
        </section>
      </main>

      {isPickerOpen && (
        <ModelPicker
          catalog={mockModelCatalog}
          selectedModelIds={state.models.map((m) => m.id)}
          onSelect={handleSelectModel}
          onClose={handleClosePicker}
        />
      )}
    </div>
  );
}
