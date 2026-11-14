import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComparePage } from './ComparePage.js';
import * as comparisonApi from './comparisonApi.js';
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
  let generateAnswerSpy: ReturnType<typeof vi.spyOn>;

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
    generateAnswerSpy = vi.spyOn(comparisonApi, 'generateAnswer');
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
    it('dispatches concurrent generation calls for all 3 models, renders waiting states, and resolves out-of-order', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog);

      const deferred1 = createDeferred<comparisonApi.GenerateResponse>();
      const deferred2 = createDeferred<comparisonApi.GenerateResponse>();
      const deferred3 = createDeferred<comparisonApi.GenerateResponse>();

      generateAnswerSpy.mockImplementation(({ modelId }: { modelId: string }) => {
        if (modelId === 'test/model-1') return deferred1.promise;
        if (modelId === 'test/model-2') return deferred2.promise;
        if (modelId === 'test/model-3') return deferred3.promise;
        return Promise.reject(new Error('Unexpected model'));
      });

      render(<ComparePage />);
      await screen.findByText('Model One');

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });

      await user.type(textarea, 'Какая погода?');
      await user.click(sendBtn);

      // Verify prompt is cleared
      expect(textarea).toHaveValue('');

      // Verify all 3 generation calls were made concurrently before any resolved
      expect(generateAnswerSpy).toHaveBeenCalledTimes(3);
      expect(generateAnswerSpy).toHaveBeenCalledWith(
        { prompt: 'Какая погода?', modelId: 'test/model-1' },
        expect.any(AbortSignal),
      );
      expect(generateAnswerSpy).toHaveBeenCalledWith(
        { prompt: 'Какая погода?', modelId: 'test/model-2' },
        expect.any(AbortSignal),
      );
      expect(generateAnswerSpy).toHaveBeenCalledWith(
        { prompt: 'Какая погода?', modelId: 'test/model-3' },
        expect.any(AbortSignal),
      );

      // Verify pending status in all 3 cells
      const waitingStatuses = screen.getAllByRole('status');
      expect(waitingStatuses.some((s) => s.textContent?.includes('Ждём ответ…'))).toBe(true);

      // Resolve Model 3 first (out of order!)
      await act(async () => {
        deferred3.resolve({
          modelId: 'test/model-3',
          text: 'Ответ от Model Three',
          durationMs: 1500,
        });
      });

      expect(screen.getByText('Ответ от Model Three')).toBeInTheDocument();
      expect(screen.getByText('1,5 с')).toBeInTheDocument();

      // Resolve Model 1 second
      await act(async () => {
        deferred1.resolve({
          modelId: 'test/model-1',
          text: 'Ответ от Model One',
          durationMs: 2200,
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
    });

    it('allows sending a second prompt while earlier turn is still pending', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      const deferredTurn1 = createDeferred<comparisonApi.GenerateResponse>();
      const deferredTurn2 = createDeferred<comparisonApi.GenerateResponse>();

      let callCount = 0;
      generateAnswerSpy.mockImplementation(() => {
        callCount++;
        return callCount <= 2 ? deferredTurn1.promise : deferredTurn2.promise;
      });

      render(<ComparePage />);
      await screen.findByText('Model One');

      const textarea = screen.getByRole('textbox');
      const sendBtn = screen.getByRole('button', { name: /отправить вопрос/i });

      // First question
      await user.type(textarea, 'Вопрос 1');
      await user.click(sendBtn);

      expect(generateAnswerSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Вопрос 1')).toBeInTheDocument();

      // Second question while first is pending
      await user.type(textarea, 'Вопрос 2');
      await user.click(sendBtn);

      expect(generateAnswerSpy).toHaveBeenCalledTimes(4);
      expect(screen.getByText('Вопрос 1')).toBeInTheDocument();
      expect(screen.getByText('Вопрос 2')).toBeInTheDocument();
    });
  });

  describe('Retry functionality', () => {
    it('retries only the errored cell using the turn question and guards against double-click', async () => {
      const user = userEvent.setup();
      fetchModelsSpy.mockResolvedValue(testCatalog.slice(0, 2));

      let callIndex = 0;
      const retryDeferred = createDeferred<comparisonApi.GenerateResponse>();

      generateAnswerSpy.mockImplementation(({ modelId }: { modelId: string }) => {
        callIndex++;
        if (callIndex === 1) {
          return Promise.resolve({
            modelId,
            text: 'Good answer M1',
            durationMs: 1000,
          });
        }
        if (callIndex === 2) {
          return Promise.reject(new comparisonApi.ComparisonApiError('UPSTREAM_TIMEOUT'));
        }
        // Retry call
        return retryDeferred.promise;
      });

      render(<ComparePage />);
      await screen.findByText('Model One');

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Исторический вопрос');
      await user.click(screen.getByRole('button', { name: /отправить вопрос/i }));

      // Wait for M1 success and M2 error
      await screen.findByText('Good answer M1');
      await screen.findByText('Время ожидания истекло.');

      const retryBtn = screen.getByRole('button', { name: /повторить/i });
      expect(generateAnswerSpy).toHaveBeenCalledTimes(2);

      // Rapidly double click retry
      await user.click(retryBtn);
      await user.click(retryBtn);

      // Only 1 additional call made due to in-flight synchronous guard!
      expect(generateAnswerSpy).toHaveBeenCalledTimes(3);
      expect(generateAnswerSpy).toHaveBeenLastCalledWith(
        { prompt: 'Исторический вопрос', modelId: 'test/model-2' },
        expect.any(AbortSignal),
      );

      // Resolve retry
      await act(async () => {
        retryDeferred.resolve({
          modelId: 'test/model-2',
          text: 'Successful retry answer M2',
          durationMs: 1800,
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
      const deferred = createDeferred<comparisonApi.GenerateResponse>();

      generateAnswerSpy.mockImplementation((_input: unknown, signal?: AbortSignal) => {
        capturedSignal = signal;
        return deferred.promise;
      });

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
        deferred.resolve({
          modelId: 'test/model-1',
          text: 'Ghost answer',
          durationMs: 1000,
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
      const lateModel = createDeferred<comparisonApi.GenerateResponse>();
      generateAnswerSpy.mockImplementation(
        ({ modelId }: { modelId: string }, signal?: AbortSignal) => {
          if (modelId === 'test/model:variant') {
            m3Signal = signal;
            return lateModel.promise;
          }
          return createDeferred<comparisonApi.GenerateResponse>().promise;
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
        lateModel.resolve({
          modelId: 'test/model:variant',
          text: 'Ghost removed model',
          durationMs: 1,
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
    const deferred = createDeferred<comparisonApi.GenerateResponse>();
    generateAnswerSpy.mockImplementation((_input: unknown, signal: AbortSignal) => {
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
      deferred.resolve({ modelId: 'test/model-1', text: 'Late unmounted', durationMs: 0 });
    });
    expect(screen.queryByText('Late unmounted')).toBeNull();
  });
});
