import { useEffect, useReducer, useRef, useState, useCallback } from 'react';
import type { CompareAction } from './types.js';
import {
  comparisonReducer,
  createInitialComparisonState,
  validatePrompt,
} from './comparisonState.js';
import {
  fetchModels,
  generateAnswer,
  ComparisonApiError,
  type ComparisonApiErrorCode,
} from './comparisonApi.js';
import { CompareTopBar } from './components/CompareTopBar.js';
import { CompareGrid } from './components/CompareGrid.js';
import { AddModelColumn } from './components/AddModelColumn.js';
import { PromptForm } from './components/PromptForm.js';
import { ModelPicker } from './components/ModelPicker.js';
import styles from './ComparePage.module.css';

function mapErrorCodeToMessage(code: ComparisonApiErrorCode | string): string {
  switch (code) {
    case 'INVALID_REQUEST':
      return 'Некорректный запрос.';
    case 'GENERATION_UNAVAILABLE':
      return 'Генерация недоступна.';
    case 'UPSTREAM_AUTH_ERROR':
      return 'Ошибка настройки сервиса.';
    case 'UPSTREAM_LIMIT_EXCEEDED':
      return 'Лимит запросов исчерпан.';
    case 'UPSTREAM_TIMEOUT':
      return 'Время ожидания истекло.';
    case 'UPSTREAM_INVALID_RESPONSE':
    case 'INVALID_RESPONSE':
      return 'Некорректный ответ сервиса.';
    case 'NETWORK_ERROR':
      return 'Не удалось связаться с сервером.';
    case 'UPSTREAM_ERROR':
    default:
      return 'Не удалось получить ответ.';
  }
}

export function ComparePage() {
  const [state, dispatch] = useReducer(comparisonReducer, undefined, createInitialComparisonState);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogReloadCount, setCatalogReloadCount] = useState(0);

  const [promptValue, setPromptValue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [promptError, setPromptError] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const addModelBtnRef = useRef<HTMLButtonElement>(null);
  const pickerWasOpen = useRef(false);

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const inFlightByCellRef = useRef<Map<string, string>>(new Map());
  const isMountedRef = useRef(true);

  useEffect(() => {
    const controllers = abortControllersRef.current;
    const inFlight = inFlightByCellRef.current;
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      for (const controller of controllers.values()) {
        controller.abort();
      }
      controllers.clear();
      inFlight.clear();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setCatalogStatus('loading');

    fetchModels(controller.signal)
      .then((catalog) => {
        if (!active) return;
        dispatch({ type: 'catalog-loaded', catalog });
        setCatalogStatus('ready');
      })
      .catch((_err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setCatalogStatus('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [catalogReloadCount]);

  useEffect(() => {
    if (pickerWasOpen.current && !isPickerOpen) {
      const addButton = addModelBtnRef.current;
      if (addButton && !addButton.disabled) addButton.focus();
      else promptInputRef.current?.focus();
    }
    pickerWasOpen.current = isPickerOpen;
  }, [isPickerOpen]);

  const handleRetryCatalog = () => {
    setCatalogReloadCount((c) => c + 1);
  };

  const runGeneration = useCallback(
    async (turnId: string, modelId: string, prompt: string, requestId: string) => {
      const cellKey = JSON.stringify([turnId, modelId]);
      const controller = new AbortController();
      abortControllersRef.current.set(requestId, controller);
      inFlightByCellRef.current.set(cellKey, requestId);

      try {
        const result = await generateAnswer({ prompt, modelId }, controller.signal);
        if (!isMountedRef.current || controller.signal.aborted) return;

        if (inFlightByCellRef.current.get(cellKey) === requestId) {
          inFlightByCellRef.current.delete(cellKey);
        }

        const durationSeconds = result.durationMs / 1000;
        const durationLabel =
          durationSeconds.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' с';

        dispatch({
          type: 'resolve',
          turnId,
          modelId,
          requestId,
          answer: {
            state: 'success',
            markdown: result.text,
            durationLabel,
          },
        });
      } catch (err: unknown) {
        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }

        if (inFlightByCellRef.current.get(cellKey) === requestId) {
          inFlightByCellRef.current.delete(cellKey);
        }

        const errorCode = err instanceof ComparisonApiError ? err.code : 'UPSTREAM_ERROR';
        const message = mapErrorCodeToMessage(errorCode);

        dispatch({
          type: 'resolve',
          turnId,
          modelId,
          requestId,
          answer: {
            state: 'error',
            message,
            description: 'Повторите запрос позже.',
          },
        });
      } finally {
        if (abortControllersRef.current.get(requestId) === controller) {
          abortControllersRef.current.delete(requestId);
        }
      }
    },
    [],
  );

  const handleSend = (prompt: string) => {
    const error = validatePrompt(prompt);
    if (error) {
      setPromptError(error);
      return;
    }

    if (state.models.length < 2 || state.models.length > 4) {
      return;
    }

    const turnId = crypto.randomUUID();
    const modelsSnapshot = [...state.models];
    const requests: Record<string, string> = {};

    for (const model of modelsSnapshot) {
      requests[model.id] = crypto.randomUUID();
    }

    dispatch({ type: 'send', turnId, prompt, requests });
    setPromptValue('');
    setPromptError('');
    setStatusMessage('');
    promptInputRef.current?.focus();

    for (const model of modelsSnapshot) {
      void runGeneration(turnId, model.id, prompt, requests[model.id]);
    }
  };

  const handleAction = (action: CompareAction) => {
    switch (action.type) {
      case 'share': {
        setStatusMessage('Общий доступ пока не поддерживается.');
        break;
      }
      case 'new-comparison': {
        for (const controller of abortControllersRef.current.values()) {
          controller.abort();
        }
        abortControllersRef.current.clear();
        inFlightByCellRef.current.clear();

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
        if (state.models.length <= 2) {
          return;
        }

        for (const [cellKey, reqId] of Array.from(inFlightByCellRef.current.entries())) {
          const [, mId] = JSON.parse(cellKey) as [string, string];
          if (mId === action.modelId) {
            abortControllersRef.current.get(reqId)?.abort();
            abortControllersRef.current.delete(reqId);
            inFlightByCellRef.current.delete(cellKey);
          }
        }

        dispatch({ type: 'remove-model', modelId: action.modelId });
        promptInputRef.current?.focus();
        break;
      }
      case 'retry': {
        const cellKey = JSON.stringify([action.turnId, action.modelId]);
        if (inFlightByCellRef.current.has(cellKey)) {
          return;
        }

        if (!state.models.some((m) => m.id === action.modelId)) {
          return;
        }

        const targetTurn = state.turns.find((t) => t.id === action.turnId);
        if (!targetTurn) {
          return;
        }

        const targetAnswer = targetTurn.answers[action.modelId];
        if (!targetAnswer || targetAnswer.state !== 'error') {
          return;
        }

        const requestId = crypto.randomUUID();
        inFlightByCellRef.current.set(cellKey, requestId);

        dispatch({
          type: 'retry',
          turnId: action.turnId,
          modelId: action.modelId,
          requestId,
        });

        void runGeneration(action.turnId, action.modelId, targetTurn.question, requestId);
        break;
      }
      case 'send': {
        handleSend(action.prompt);
        break;
      }
    }
  };

  const handleClosePicker = useCallback(() => setIsPickerOpen(false), []);

  const handleSelectModel = (modelId: string) => {
    dispatch({ type: 'select-model', modelId });
    setIsPickerOpen(false);
  };

  const isPromptDisabled = catalogStatus !== 'ready' || state.models.length < 2;

  const isAddDisabled =
    catalogStatus !== 'ready' ||
    state.models.length >= 4 ||
    state.models.length >= state.catalog.length;

  return (
    <div data-testid="compare-page" className={styles.page}>
      <CompareTopBar
        onShare={() => handleAction({ type: 'share' })}
        onNewComparison={() => handleAction({ type: 'new-comparison' })}
      />

      <main className={styles.container}>
        {catalogStatus === 'loading' && (
          <div role="status" className={styles.catalogBanner}>
            Загружаем модели…
          </div>
        )}

        {catalogStatus === 'error' && (
          <div role="alert" className={styles.catalogBanner}>
            <span>Не удалось загрузить модели.</span>
            <button
              type="button"
              className={styles.catalogRetryButton}
              onClick={handleRetryCatalog}
            >
              Повторить загрузку
            </button>
          </div>
        )}

        {catalogStatus === 'ready' && state.catalog.length === 0 && (
          <div className={styles.emptyCatalogMessage}>Нет доступных моделей.</div>
        )}

        {catalogStatus === 'ready' && state.catalog.length === 1 && (
          <>
            <div role="status" className={styles.oneModelBanner}>
              Для сравнения нужны минимум две модели.
            </div>
            <div className={styles.bodyGrid}>
              <CompareGrid models={state.models} turns={state.turns} onAction={handleAction} />
              <AddModelColumn
                ref={addModelBtnRef}
                onAdd={() => handleAction({ type: 'add-model' })}
                disabled={true}
              />
            </div>
          </>
        )}

        {catalogStatus === 'ready' && state.catalog.length >= 2 && (
          <div className={styles.bodyGrid}>
            <CompareGrid models={state.models} turns={state.turns} onAction={handleAction} />
            <AddModelColumn
              ref={addModelBtnRef}
              onAdd={() => handleAction({ type: 'add-model' })}
              disabled={isAddDisabled}
            />
          </div>
        )}

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
              disabled={isPromptDisabled}
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
          catalog={state.catalog.map((m) => ({ ...m }))}
          selectedModelIds={state.models.map((m) => m.id)}
          onSelect={handleSelectModel}
          onClose={handleClosePicker}
        />
      )}
    </div>
  );
}
