import { formatCostUsd } from './formatCost.js';
import { useEffect, useLayoutEffect, useReducer, useRef, useState, useCallback } from 'react';
import type { CompareAction } from './types.js';
import {
  comparisonReducer,
  createInitialComparisonState,
  validatePrompt,
} from './comparisonState.js';
import { fetchModels, ComparisonApiError, type ComparisonApiErrorCode } from './comparisonApi.js';
import { streamAnswer } from './comparisonStream.js';
import { useNarrowLayout } from './useNarrowLayout.js';
import { CompareTopBar } from './components/CompareTopBar.js';
import { CompareGrid } from './components/CompareGrid.js';
import { AddModelColumn } from './components/AddModelColumn.js';
import { PromptForm } from './components/PromptForm.js';
import { ModelPicker } from './components/ModelPicker.js';
import styles from './ComparePage.module.css';

function selectedTabInTurn(turnId?: string): HTMLButtonElement | null {
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="tab"][aria-selected="true"]'),
  );
  return (
    tabs.find(
      (tab) =>
        tab.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId === turnId &&
        tab.offsetParent !== null,
    ) ??
    tabs.filter((tab) => tab.offsetParent !== null).at(-1) ??
    null
  );
}

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
  const isNarrow = useNarrowLayout();
  const [state, dispatch] = useReducer(comparisonReducer, undefined, createInitialComparisonState);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogReloadCount, setCatalogReloadCount] = useState(0);

  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const resolvedActiveModelId = state.models.some((m) => m.id === activeModelId)
    ? activeModelId
    : (state.models[0]?.id ?? null);

  useEffect(() => {
    if (activeModelId !== resolvedActiveModelId) {
      setActiveModelId(resolvedActiveModelId);
    }
  }, [activeModelId, resolvedActiveModelId]);

  const [promptValue, setPromptValue] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [promptError, setPromptError] = useState('');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const addModelBtnRef = useRef<HTMLButtonElement>(null);
  const pickerAnchorRef = useRef<HTMLElement | null>(null);
  const pickerWasOpen = useRef(false);
  const lastFocusedRef = useRef<{ element: HTMLElement; turnId?: string } | null>(null);
  const pendingTabFocusRef = useRef<{ turnId?: string } | null>(null);

  useLayoutEffect(() => {
    if (pendingTabFocusRef.current && isNarrow) {
      selectedTabInTurn(pendingTabFocusRef.current.turnId)?.focus({ preventScroll: true });
      pendingTabFocusRef.current = null;
    }
  }, [isNarrow, state.models, resolvedActiveModelId]);

  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const inFlightByCellRef = useRef<Map<string, string>>(new Map());
  const isMountedRef = useRef(true);

  const prevIsNarrowRef = useRef(isNarrow);
  useLayoutEffect(() => {
    const prevNarrow = prevIsNarrowRef.current;
    prevIsNarrowRef.current = isNarrow;
    if (prevNarrow === isNarrow) return;

    const previous = lastFocusedRef.current;
    const activeEl = document.activeElement as HTMLElement | null;
    const lostFocus = activeEl === document.body && previous && !previous.element.isConnected;
    if (lostFocus || (activeEl && activeEl !== document.body && activeEl.offsetParent === null)) {
      if (isPickerOpen) return; // Native modal keeps keyboard focus until it closes.
      if (isNarrow) {
        const selectedTab = selectedTabInTurn(previous?.turnId);
        if (selectedTab && selectedTab.offsetParent !== null) {
          selectedTab.focus();
        } else {
          promptInputRef.current?.focus();
        }
      } else {
        const header = Array.from(document.querySelectorAll<HTMLElement>('[data-model-id]')).find(
          (node) =>
            node.dataset.modelId === resolvedActiveModelId && node.closest('[class*="modelBar"]'),
        );
        const removeBtn = header?.querySelector<HTMLButtonElement>('button');
        if (removeBtn && !removeBtn.disabled && removeBtn.offsetParent !== null) {
          removeBtn.focus();
        } else {
          promptInputRef.current?.focus();
        }
      }
    }
  }, [isNarrow, isPickerOpen, resolvedActiveModelId]);

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
      const trigger = pickerAnchorRef.current;
      if (
        trigger &&
        document.body.contains(trigger) &&
        !(trigger as HTMLButtonElement).disabled &&
        trigger.offsetParent !== null
      ) {
        trigger.focus();
      } else {
        const visibleTab = selectedTabInTurn(
          trigger?.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId,
        );
        if (visibleTab && visibleTab.offsetParent !== null) {
          visibleTab.focus();
        } else {
          promptInputRef.current?.focus();
        }
      }
    }
    pickerWasOpen.current = isPickerOpen;
  }, [isPickerOpen]);

  const handleRetryCatalog = () => {
    setCatalogReloadCount((c) => c + 1);
  };

  const isAnyCellActive = state.turns.some((turn) =>
    state.models.some((model) => {
      const ans = turn.answers[model.id];
      return ans && (ans.state === 'pending' || ans.state === 'streaming');
    }),
  );

  const handleStopCell = useCallback((turnId: string, modelId: string) => {
    const cellKey = JSON.stringify([turnId, modelId]);
    const requestId = inFlightByCellRef.current.get(cellKey);
    if (!requestId) return;

    inFlightByCellRef.current.delete(cellKey);
    dispatch({ type: 'stop', turnId, modelId, requestId });

    const controller = abortControllersRef.current.get(requestId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(requestId);
    }
  }, []);

  const handleStopAll = useCallback(() => {
    const snapshot = Array.from(inFlightByCellRef.current.entries());
    inFlightByCellRef.current.clear();

    for (const [cellKey, requestId] of snapshot) {
      const [turnId, modelId] = JSON.parse(cellKey) as [string, string];
      dispatch({ type: 'stop', turnId, modelId, requestId });
      const controller = abortControllersRef.current.get(requestId);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(requestId);
      }
    }
    promptInputRef.current?.focus();
  }, []);

  const runGeneration = useCallback(
    async (turnId: string, modelId: string, prompt: string, requestId: string) => {
      const cellKey = JSON.stringify([turnId, modelId]);
      const controller = new AbortController();
      abortControllersRef.current.set(requestId, controller);
      inFlightByCellRef.current.set(cellKey, requestId);

      try {
        const result = await streamAnswer({ prompt, modelId }, controller.signal, (deltaEvent) => {
          if (!isMountedRef.current || controller.signal.aborted) return;
          if (inFlightByCellRef.current.get(cellKey) !== requestId) return;

          dispatch({
            type: 'stream-delta',
            turnId,
            modelId,
            requestId,
            event: deltaEvent,
          });
        });

        if (!isMountedRef.current || controller.signal.aborted) return;
        if (inFlightByCellRef.current.get(cellKey) !== requestId) return;

        inFlightByCellRef.current.delete(cellKey);

        const durationSeconds = result.durationMs / 1000;
        const durationLabel =
          durationSeconds.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' с';

        dispatch({
          type: 'resolve',
          turnId,
          modelId,
          requestId,
          result: {
            state: 'success',
            durationLabel,
            costLabel: formatCostUsd(result.costUsd),
          },
        });
      } catch (err: unknown) {
        if (!isMountedRef.current || controller.signal.aborted) {
          return;
        }

        if (inFlightByCellRef.current.get(cellKey) !== requestId) {
          return;
        }

        inFlightByCellRef.current.delete(cellKey);

        const errorCode = err instanceof ComparisonApiError ? err.code : 'UPSTREAM_ERROR';
        const message = mapErrorCodeToMessage(errorCode);

        dispatch({
          type: 'resolve',
          turnId,
          modelId,
          requestId,
          result: {
            state: 'error',
            message,
            description: 'Повторите запрос позже.',
          },
        });
      } finally {
        if (abortControllersRef.current.get(requestId) === controller) {
          abortControllersRef.current.delete(requestId);
        }
        if (inFlightByCellRef.current.get(cellKey) === requestId) {
          inFlightByCellRef.current.delete(cellKey);
        }
      }
    },
    [],
  );

  const handleSend = (prompt: string) => {
    if (isAnyCellActive || inFlightByCellRef.current.size > 0) {
      return;
    }

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
        pickerAnchorRef.current = addModelBtnRef.current;
        setIsPickerOpen(true);
        break;
      }
      case 'remove-model': {
        if (state.models.length <= 2) {
          return;
        }
        if (isNarrow) {
          pendingTabFocusRef.current = {
            turnId: document.activeElement?.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId,
          };
        }

        for (const [cellKey, reqId] of Array.from(inFlightByCellRef.current.entries())) {
          const [, mId] = JSON.parse(cellKey) as [string, string];
          if (mId === action.modelId) {
            abortControllersRef.current.get(reqId)?.abort();
            abortControllersRef.current.delete(reqId);
            inFlightByCellRef.current.delete(cellKey);
          }
        }

        if (action.modelId === resolvedActiveModelId) {
          const currentIndex = state.models.findIndex((m) => m.id === action.modelId);
          const remainingModels = state.models.filter((m) => m.id !== action.modelId);
          if (remainingModels.length > 0) {
            const nextIndex =
              currentIndex < remainingModels.length ? currentIndex : remainingModels.length - 1;
            setActiveModelId(remainingModels[nextIndex].id);
          }
        }

        dispatch({ type: 'remove-model', modelId: action.modelId });
        if (!isNarrow) promptInputRef.current?.focus();
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
        if (!targetAnswer || (targetAnswer.state !== 'error' && targetAnswer.state !== 'stopped')) {
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
      case 'stop': {
        handleStopCell(action.turnId, action.modelId);
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
    if (
      !state.catalog.some((m) => m.id === modelId) ||
      state.models.some((m) => m.id === modelId) ||
      state.models.length >= 4
    ) {
      return;
    }
    setActiveModelId(modelId);
    dispatch({ type: 'select-model', modelId });
    setIsPickerOpen(false);
  };

  const handleOpenPickerFromDesktop = () => {
    pickerAnchorRef.current = addModelBtnRef.current;
    setIsPickerOpen(true);
  };

  const handleOpenPickerFromMobile = (trigger: HTMLButtonElement) => {
    pickerAnchorRef.current = trigger;
    setIsPickerOpen(true);
  };

  const isPromptDisabled = catalogStatus !== 'ready' || state.models.length < 2;

  const isAddDisabled =
    catalogStatus !== 'ready' ||
    state.models.length >= 4 ||
    state.models.length >= state.catalog.length;

  return (
    <div
      data-testid="compare-page"
      className={styles.page}
      onFocusCapture={(event) => {
        const element = event.target as HTMLElement;
        lastFocusedRef.current = {
          element,
          turnId: element.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId,
        };
      }}
    >
      <CompareTopBar
        isNarrow={isNarrow}
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
              <CompareGrid
                models={state.models}
                turns={state.turns}
                onAction={handleAction}
                isNarrow={isNarrow}
                activeModelId={resolvedActiveModelId}
                onSelectModel={setActiveModelId}
                onAddModel={handleOpenPickerFromMobile}
                addDisabled={true}
              />
              {!isNarrow && (
                <AddModelColumn
                  ref={addModelBtnRef}
                  onAdd={handleOpenPickerFromDesktop}
                  disabled={true}
                />
              )}
            </div>
          </>
        )}

        {catalogStatus === 'ready' && state.catalog.length >= 2 && (
          <div className={styles.bodyGrid}>
            <CompareGrid
              models={state.models}
              turns={state.turns}
              onAction={handleAction}
              isNarrow={isNarrow}
              activeModelId={resolvedActiveModelId}
              onSelectModel={setActiveModelId}
              onAddModel={handleOpenPickerFromMobile}
              addDisabled={isAddDisabled}
            />
            {!isNarrow && (
              <AddModelColumn
                ref={addModelBtnRef}
                onAdd={handleOpenPickerFromDesktop}
                disabled={isAddDisabled}
              />
            )}
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
              busy={isAnyCellActive}
              disabled={isPromptDisabled}
              onSend={handleSend}
              onStop={handleStopAll}
              stopDescription="Остановить все текущие ответы"
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
          anchorRef={pickerAnchorRef}
        />
      )}
    </div>
  );
}
