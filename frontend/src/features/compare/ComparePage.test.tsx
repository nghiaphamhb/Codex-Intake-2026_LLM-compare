import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparePage } from './ComparePage.js';
import * as comparisonApi from './comparisonApi.js';
import * as comparisonStream from './comparisonStream.js';
import type { CompareModel } from './types.js';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const testCatalog: CompareModel[] = [
  { id: 'test/model-1', name: 'Model One', provider: 'Provider A' },
  { id: 'test/model-2', name: 'Model Two', provider: 'Provider B' },
  { id: 'test/model-3', name: 'Model Three', provider: 'Provider C' },
  { id: 'test/model-4', name: 'Model Four', provider: 'Provider D' },
  { id: 'test/model-5', name: 'Model Five', provider: 'Provider E' },
];

describe('ComparePage', () => {
  let fetchModelsSpy: ReturnType<typeof vi.spyOn>;
  let streamAnswerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();

    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
    }

    fetchModelsSpy = vi.spyOn(comparisonApi, 'fetchModels');
    streamAnswerSpy = vi.spyOn(comparisonStream, 'streamAnswer');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Catalog lifecycle', () => {
    it('displays loading banner and disables inputs while catalog is loading', () => {
      const deferred = createDeferred<CompareModel[]>();
      fetchModelsSpy.mockReturnValue(deferred.promise);

      render(<ComparePage />);

      const loadingBanner = screen.getByText('Загружаем модели…');
      expect(loadingBanner).toBeInTheDocument();
      expect(loadingBanner).toHaveAttribute('role', 'status');
      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /отправить вопрос/i })).toBeDisabled();
      expect(screen.queryByTestId('model-picker')).toBeNull();
    });

    it('displays error banner and retry button when catalog loading fails, and retrying succeeds', async () => {
      const user = userEvent.setup();
      let attempt = 0;
      fetchModelsSpy.mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new comparisonApi.ComparisonApiError('NETWORK_ERROR'));
        }
        return Promise.resolve(testCatalog);
      });

      render(<ComparePage />);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Не удалось загрузить модели.');

      const retryBtn = screen.getByRole('button', { name: 'Повторить загрузку' });
      await user.click(retryBtn);

      await screen.findByText('Model One');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByText('Model Two')).toBeInTheDocument();
      expect(screen.getByText('Model Three')).toBeInTheDocument();
    });

    it('displays empty catalog message when catalog returns 0 models', async () => {
      fetchModelsSpy.mockResolvedValue([]);

      render(<ComparePage />);

      const emptyMsg = await screen.findByText('Нет доступных моделей.');
      expect(emptyMsg).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /отправить вопрос/i })).toBeDisabled();
    });

    it('displays 1 model header with warning when catalog returns exactly 1 model', async () => {
      fetchModelsSpy.mockResolvedValue([testCatalog[0]]);

      render(<ComparePage />);

      await screen.findByText('Model One');
      expect(screen.getByText('Для сравнения нужны минимум две модели.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /отправить вопрос/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Добавить модель' })).toBeDisabled();
    });

    it('initializes with first 3 models when catalog has >= 3 models', async () => {
      fetchModelsSpy.mockResolvedValue(testCatalog);

      render(<ComparePage />);

      await screen.findByText('Model One');
      expect(screen.getByText('Model Two')).toBeInTheDocument();
      expect(screen.getByText('Model Three')).toBeInTheDocument();
      expect(screen.queryByText('Model Four')).toBeNull();
    });
  });

  describe('Prompt sending and generation orchestration', () => {
    it('dispatches concurrent generation calls for all 3 models, renders waiting states, and resolves out-of-order with streaming deltas', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog);

      const deferred1 = createDeferred<comparisonStream.ComparisonStreamResult>();
      const deferred2 = createDeferred<comparisonStream.ComparisonStreamResult>();
      const deferred3 = createDeferred<comparisonStream.ComparisonStreamResult>();

      let onDelta1: (d: comparisonStream.ComparisonStreamDelta) => void = () => {};
      let _onDelta2: (d: comparisonStream.ComparisonStreamDelta) => void = () => {};
      let onDelta3: (d: comparisonStream.ComparisonStreamDelta) => void = () => {};

      streamAnswerSpy.mockImplementation(
        (
          { modelId }: { modelId: string },
          _signal: AbortSignal,
          onDelta: (d: comparisonStream.ComparisonStreamDelta) => void,
        ) => {
          if (modelId === 'test/model-1') {
            onDelta1 = onDelta;
            return deferred1.promise;
          }
          if (modelId === 'test/model-2') {
            _onDelta2 = onDelta;
            return deferred2.promise;
          }
          if (modelId === 'test/model-3') {
            onDelta3 = onDelta;
            return deferred3.promise;
          }
          return Promise.reject(new Error('Unexpected model'));
        },
      );

      render(<ComparePage />);
      await screen.findByText('Model One');

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });

      await user.type(textarea, 'Какая погода?');
      await user.click(sendBtn);

      // Verify prompt is cleared
      expect(textarea).toHaveValue('');

      // Verify all 3 generation calls were made concurrently before any resolved
      expect(streamAnswerSpy).toHaveBeenCalledTimes(3);
      expect(streamAnswerSpy).toHaveBeenCalledWith(
        { prompt: 'Какая погода?', modelId: 'test/model-1' },
        expect.any(AbortSignal),
        expect.any(Function),
      );
      expect(streamAnswerSpy).toHaveBeenCalledWith(
        { prompt: 'Какая погода?', modelId: 'test/model-2' },
        expect.any(AbortSignal),
        expect.any(Function),
      );
      expect(streamAnswerSpy).toHaveBeenCalledWith(
        { prompt: 'Какая погода?', modelId: 'test/model-3' },
        expect.any(AbortSignal),
        expect.any(Function),
      );

      // Verify pending status in all 3 cells and composer is busy with Stop all
      expect(screen.getByRole('button', { name: 'Остановить генерацию' })).toBeInTheDocument();
      const waitingStatuses = screen.getAllByRole('status');
      expect(waitingStatuses.some((s) => s.textContent?.includes('Ждём ответ…'))).toBe(true);

      // Stream deltas to Model 3
      act(() => {
        onDelta3({ type: 'reasoning-delta', delta: 'Analyzing query...' });
        onDelta3({ type: 'text-delta', delta: 'Ответ от Model Three' });
      });

      expect(screen.getByText('Ответ от Model Three')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Рассуждения' })).toBeInTheDocument();

      // Resolve Model 3 first (out of order!)
      await act(async () => {
        deferred3.resolve({
          durationMs: 1500,
          costUsd: 0.0016,
        });
      });

      expect(screen.getByText('Ответ от Model Three')).toBeInTheDocument();
      expect(screen.getByText('$0,0016').parentElement).toHaveTextContent('1,5 с · $0,0016');

      // Resolve Model 1 second
      act(() => {
        onDelta1({ type: 'text-delta', delta: 'Ответ от Model One' });
      });
      await act(async () => {
        deferred1.resolve({
          durationMs: 2200,
          costUsd: null,
        });
      });
      expect(screen.getByText('Ответ от Model One')).toBeInTheDocument();
      expect(screen.getByText('2,2 с')).toBeInTheDocument();

      // Model 2 errors
      await act(async () => {
        deferred2.reject(new comparisonApi.ComparisonApiError('UPSTREAM_LIMIT_EXCEEDED'));
      });

      expect(screen.getByText('Лимит запросов исчерпан.')).toBeInTheDocument();
      expect(screen.getByText('Повторите запрос позже.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /повторить/i })).toBeInTheDocument();

      // When all are done/error, composer busy returns to false
      expect(screen.getByRole('button', { name: /отправить вопрос/i })).toBeInTheDocument();
    });

    it('blocks sending new prompt while turn is active, turns composer into Stop all, and preserves draft', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      const deferredTurn1 = createDeferred<comparisonStream.ComparisonStreamResult>();
      streamAnswerSpy.mockImplementation(() => deferredTurn1.promise);

      render(<ComparePage />);
      await screen.findByText('Model One');

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });

      // First question
      await user.type(textarea, 'Вопрос 1');
      await user.click(sendBtn);

      expect(streamAnswerSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Вопрос 1')).toBeInTheDocument();

      // Composer is now busy with Stop button
      const stopAllBtn = screen.getByRole('button', { name: 'Остановить генерацию' });
      expect(stopAllBtn).toBeInTheDocument();

      // Typing a draft while busy is allowed
      await user.type(textarea, 'Черновик вопроса 2');
      expect(textarea).toHaveValue('Черновик вопроса 2');

      // Pressing enter does NOT send or create second turn
      await user.type(textarea, '{Enter}');
      expect(streamAnswerSpy).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Черновик вопроса 2', { selector: 'p' })).toBeNull();
      expect(textarea).toHaveValue('Черновик вопроса 2');

      // Stop all cancels requests, stops cells, preserves draft, and restores Send button
      await user.click(stopAllBtn);
      expect(screen.getAllByText('Генерация остановлена.')).toHaveLength(2);
      expect(textarea).toHaveValue('Черновик вопроса 2');
      expect(screen.getByRole('button', { name: /отправить вопрос/i })).toBeInTheDocument();
    });

    it('allows stopping an individual cell while others continue, and retrying the stopped cell', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      const signals: Record<string, AbortSignal> = {};
      const deferreds: Record<string, Deferred<comparisonStream.ComparisonStreamResult>> = {};

      streamAnswerSpy.mockImplementation(
        ({ modelId }: { modelId: string }, signal: AbortSignal) => {
          signals[modelId] = signal;
          deferreds[modelId] = createDeferred<comparisonStream.ComparisonStreamResult>();
          return deferreds[modelId].promise;
        },
      );

      render(<ComparePage />);
      await screen.findByText('Model One');

      await user.type(screen.getByRole('textbox'), 'Вопрос для остановки одной модели');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      // Stop only Model One
      const stopModel1Btn = screen.getByRole('button', {
        name: 'Остановить ответ: Model One',
      });
      await user.click(stopModel1Btn);

      // Model One is stopped and aborted
      expect(signals['test/model-1']?.aborted).toBe(true);
      expect(screen.getByText('Генерация остановлена.')).toBeInTheDocument();

      // Model Two is STILL active and NOT aborted
      expect(signals['test/model-2']?.aborted).toBe(false);
      expect(
        screen.getByRole('button', { name: 'Остановить ответ: Model Two' }),
      ).toBeInTheDocument();

      // Retrying Model One is allowed while Model Two is still active
      const retryModel1Btn = screen.getByRole('button', { name: 'Повторить' });
      await user.click(retryModel1Btn);

      expect(streamAnswerSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retry functionality', () => {
    it('retries only the errored cell using the turn question and guards against double-click', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      let callIndex = 0;
      const retryDeferred = createDeferred<comparisonStream.ComparisonStreamResult>();

      streamAnswerSpy.mockImplementation(
        (
          _input: unknown,
          _signal: AbortSignal,
          onDelta: (d: comparisonStream.ComparisonStreamDelta) => void,
        ) => {
          callIndex++;
          if (callIndex === 1) {
            onDelta({ type: 'text-delta', delta: 'Good answer M1' });
            return Promise.resolve({
              durationMs: 1000,
              costUsd: null,
            });
          }
          if (callIndex === 2) {
            return Promise.reject(new comparisonApi.ComparisonApiError('UPSTREAM_TIMEOUT'));
          }
          // Retry call
          onDelta({ type: 'text-delta', delta: 'Successful retry answer M2' });
          return retryDeferred.promise;
        },
      );

      render(<ComparePage />);
      await screen.findByText('Model One');

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Исторический вопрос');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      // Wait for M1 success and M2 error
      await screen.findByText('Good answer M1');
      await screen.findByText('Время ожидания истекло.');

      const retryBtn = screen.getByRole('button', { name: /повторить/i });
      expect(streamAnswerSpy).toHaveBeenCalledTimes(2);

      // Rapidly double click retry
      await user.click(retryBtn);
      await user.click(retryBtn);

      // Only 1 additional call made due to in-flight synchronous guard!
      expect(streamAnswerSpy).toHaveBeenCalledTimes(3);
      expect(streamAnswerSpy).toHaveBeenLastCalledWith(
        { prompt: 'Исторический вопрос', modelId: 'test/model-2' },
        expect.any(AbortSignal),
        expect.any(Function),
      );

      // Resolve retry
      await act(async () => {
        retryDeferred.resolve({
          durationMs: 1800,
          costUsd: null,
        });
      });

      expect(await screen.findByText('Successful retry answer M2')).toBeInTheDocument();
      expect(screen.getByText('Good answer M1')).toBeInTheDocument();
    });
  });

  describe('TopBar and Model modifications', () => {
    it('clears all turns and aborts in-flight requests on new-comparison', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      let capturedSignal: AbortSignal | undefined;
      const lateDeltas: Parameters<typeof comparisonStream.streamAnswer>[2][] = [];
      const deferred = createDeferred<comparisonStream.ComparisonStreamResult>();

      streamAnswerSpy.mockImplementation(
        (
          _input: unknown,
          signal?: AbortSignal,
          onDelta?: Parameters<typeof comparisonStream.streamAnswer>[2],
        ) => {
          capturedSignal = signal;
          if (onDelta) lateDeltas.push(onDelta);
          return deferred.promise;
        },
      );

      render(<ComparePage />);
      await screen.findByText('Model One');

      await user.type(screen.getByRole('textbox'), 'Вопрос для очистки');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      expect(screen.getByText('Вопрос для очистки')).toBeInTheDocument();
      expect(capturedSignal?.aborted).toBe(false);

      // Click new comparison
      const newBtn = screen.getByRole('button', { name: /новое сравнение/i });
      await user.click(newBtn);

      expect(screen.queryByText('Вопрос для очистки')).toBeNull();
      expect(capturedSignal?.aborted).toBe(true);

      // Late resolve does not resurrect answer
      await act(async () => {
        lateDeltas.forEach((onDelta) => onDelta({ type: 'text-delta', delta: 'Ghost answer' }));
        deferred.resolve({
          durationMs: 1000,
          costUsd: null,
        });
      });

      expect(screen.queryByText('Ghost answer')).toBeNull();
    });

    it('adds a 4th model via ModelPicker, disables Add button when 4 models reached, and preserves focus', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog);

      render(<ComparePage />);
      await screen.findByText('Model One');

      const addBtn = screen.getByRole('button', { name: 'Добавить модель' });
      await user.click(addBtn);

      // Modal is open with remaining models in catalog
      const dialog = screen.getByRole('dialog', { name: 'Добавить модель' });
      expect(dialog).toBeInTheDocument();

      const model4Btn = within(dialog).getByRole('button', { name: /Model Four/ });
      await user.click(model4Btn);

      // Model 4 added to header
      expect(await screen.findByText('Model Four')).toBeInTheDocument();

      // Now 4 models are active -> Add button is disabled
      expect(screen.getByRole('button', { name: 'Добавить модель' })).toBeDisabled();
      expect(screen.getByRole('textbox')).toHaveFocus();
    });

    it('removes a model down to minimum 2, aborting any active requests for that model', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue([
        testCatalog[0],
        testCatalog[1],
        { ...testCatalog[2], id: 'test/model:variant' },
      ]);

      let m3Signal: AbortSignal | undefined;
      let removedDelta: Parameters<typeof comparisonStream.streamAnswer>[2] | undefined;
      const lateModel = createDeferred<comparisonStream.ComparisonStreamResult>();
      streamAnswerSpy.mockImplementation(
        (
          { modelId }: { modelId: string },
          signal?: AbortSignal,
          onDelta?: Parameters<typeof comparisonStream.streamAnswer>[2],
        ) => {
          if (modelId === 'test/model:variant') {
            m3Signal = signal;
            removedDelta = onDelta;
            return lateModel.promise;
          }
          return createDeferred<comparisonStream.ComparisonStreamResult>().promise;
        },
      );

      render(<ComparePage />);
      await screen.findByText('Model One');

      await user.type(screen.getByRole('textbox'), 'Тест удаления');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      expect(screen.getByText('Model Three')).toBeInTheDocument();

      // Remove Model Three
      const removeBtn = screen.getByRole('button', { name: 'Удалить модель Model Three' });
      await user.click(removeBtn);

      expect(screen.queryByText('Model Three')).toBeNull();
      expect(m3Signal?.aborted).toBe(true);
      await user.click(screen.getByRole('button', { name: 'Добавить модель' }));
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: /Model Three/ }),
      );
      await act(async () => {
        removedDelta?.({ type: 'text-delta', delta: 'Ghost removed model' });
        lateModel.resolve({
          durationMs: 1,
          costUsd: null,
        });
      });
      expect(screen.queryByText('Ghost removed model')).toBeNull();
      expect(screen.getByText('Модель добавлена после этого вопроса.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Удалить модель Model Three' }));

      // Minimum 2 models remaining: remove buttons for M1 and M2 are disabled
      const disabledRemoveButtons = screen.getAllByRole('button', {
        name: 'Нужно оставить минимум 2 модели',
      });
      expect(disabledRemoveButtons).toHaveLength(2);
      for (const btn of disabledRemoveButtons) {
        expect(btn).toBeDisabled();
      }
    });

    it('displays status message when Share is clicked', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      render(<ComparePage />);
      await screen.findByText('Model One');

      const shareBtn = screen.getByRole('button', { name: /скопировать ссылку/i });
      await user.click(shareBtn);

      expect(screen.getByText('Общий доступ пока не поддерживается.')).toBeInTheDocument();
    });
  });
  it('aborts every generation on unmount and ignores their late results', async () => {
    const user = userEvent.setup();
    fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));
    const signals: AbortSignal[] = [];
    const deferred = createDeferred<comparisonStream.ComparisonStreamResult>();
    streamAnswerSpy.mockImplementation((_input: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return deferred.promise;
    });
    const view = render(<ComparePage />);
    await screen.findByText('Model One');
    await user.type(screen.getByRole('textbox'), 'Unmount test');
    await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));
    expect(signals).toHaveLength(2);
    view.unmount();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await act(async () => {
      deferred.resolve({ durationMs: 0, costUsd: null });
    });
    expect(screen.queryByText('Late unmounted')).toBeNull();
  });

  describe('Mobile Narrow Layout (FE009)', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        media: query,
        matches: query === '(max-width: 1279px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('renders tabs and only active model visible without background generation interruption', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 3));

      type DeltaCallback = (e: comparisonStream.ComparisonStreamDelta) => void;
      const callbacks: Record<string, DeltaCallback> = {};
      const deferreds: Record<string, Deferred<comparisonStream.ComparisonStreamResult>> = {
        'test/model-1': createDeferred(),
        'test/model-2': createDeferred(),
        'test/model-3': createDeferred(),
      };

      streamAnswerSpy.mockImplementation(
        (
          input: { prompt: string; modelId: string },
          _signal: AbortSignal,
          onDelta?: (delta: comparisonStream.ComparisonStreamDelta) => void,
        ) => {
          if (onDelta) callbacks[input.modelId] = onDelta;
          return deferreds[input.modelId].promise;
        },
      );

      render(<ComparePage />);
      await screen.findByRole('tablist', { name: 'Модели для сравнения' });

      // In empty state, tablist is rendered
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(3);
      expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
      expect(tabs[1]).toHaveAttribute('aria-selected', 'false');

      // Send prompt
      const input = screen.getByRole('textbox');
      await user.type(input, 'Mobile test prompt');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      // All 3 models called
      expect(streamAnswerSpy).toHaveBeenCalledTimes(3);

      // Model 1 receives delta
      act(() => {
        callbacks['test/model-1']({ type: 'text-delta', delta: 'Model 1 response text' });
      });
      expect(screen.getByText('Model 1 response text')).toBeInTheDocument();

      // Model 2 receives delta in background (hidden)
      act(() => {
        callbacks['test/model-2']({ type: 'text-delta', delta: 'Model 2 background delta' });
      });

      // Switch to tab 2
      await user.click(screen.getAllByRole('tab')[1]);

      // No new streamAnswer calls made on tab switch!
      expect(streamAnswerSpy).toHaveBeenCalledTimes(3);

      // Model 2's background delta is now visible!
      expect(screen.getByText('Model 2 background delta')).toBeVisible();

      // Resolve model 2
      await act(async () => {
        deferreds['test/model-2'].resolve({ durationMs: 1500, costUsd: 0.003 });
      });

      expect(screen.getByText('1,5 с')).toBeInTheDocument();
      expect(screen.getByText('$0,0030')).toBeInTheDocument();
    });

    it('falls back active model index correctly when active model is removed', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 3));
      streamAnswerSpy.mockReturnValue(new Promise(() => {}));

      render(<ComparePage />);
      await screen.findByRole('tablist', { name: 'Модели для сравнения' });

      // Send prompt to render turns and AnswerCells
      const input = screen.getByRole('textbox');
      await user.type(input, 'Turn prompt');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      const tabs = screen.getAllByRole('tab');
      // Click model 2 (index 1)
      await user.click(tabs[1]);
      expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

      // Remove model 2 via ModelHeader remove button
      const removeBtn = screen.getByRole('button', { name: 'Удалить модель Model Two' });
      await user.click(removeBtn);

      // Remaining models: [Model One, Model Three]. Model Three is now at index 1 -> becomes active!
      const updatedTabs = screen.getAllByRole('tab');
      expect(updatedTabs).toHaveLength(2);
      expect(updatedTabs[1]).toHaveAttribute('aria-selected', 'true');
      expect(updatedTabs[1]).toHaveAttribute('aria-label', 'Model Three (Provider C)');
    });
  });
});
