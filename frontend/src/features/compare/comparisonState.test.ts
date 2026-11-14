import { describe, expect, it } from 'vitest';
import type { CompareModel, ResultAnswer } from './types.js';
import {
  comparisonReducer,
  createInitialComparisonState,
  validatePrompt,
} from './comparisonState.js';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value !== null && typeof value === 'object') {
      deepFreeze(value);
    }
  }
  return obj;
}

const mockCatalog: CompareModel[] = [
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
  { id: 'meta/llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
];

describe('comparisonState', () => {
  describe('createInitialComparisonState', () => {
    it('returns an empty initial state with empty catalog, models, and turns', () => {
      const state = createInitialComparisonState();
      expect(state.catalog).toEqual([]);
      expect(state.models).toEqual([]);
      expect(state.turns).toEqual([]);
    });
  });

  describe('validatePrompt', () => {
    it('returns null for valid prompts', () => {
      expect(validatePrompt('Привет, расскажи о проекte')).toBeNull();
    });

    it('rejects empty or whitespace-only prompts with a Russian message', () => {
      expect(validatePrompt('')).toMatch(/[\u0400-\u04FF]/);
      expect(validatePrompt('   \n\t  ')).toMatch(/[\u0400-\u04FF]/);
    });

    it('preserves leading and trailing whitespace and newlines for valid content', () => {
      expect(validatePrompt('  строка с отступами и переводами\n\n  ')).toBeNull();
    });

    it('accepts exactly 10,000 Unicode code points', () => {
      const prompt10k = 'a'.repeat(10000);
      expect(validatePrompt(prompt10k)).toBeNull();
    });

    it('rejects 10,001 Unicode code points with a Russian message', () => {
      const prompt10001 = 'a'.repeat(10001);
      const error = validatePrompt(prompt10001);
      expect(error).toMatch(/[\u0400-\u04FF]/);
      expect(error).toContain('10');
    });

    it('counts Unicode code points correctly for multi-byte emoji', () => {
      const emoji10k = '🚀'.repeat(10000);
      expect(emoji10k.length).toBe(20000); // 20k UTF-16 code units
      expect(validatePrompt(emoji10k)).toBeNull(); // Exactly 10k code points

      const emoji10001 = '🚀'.repeat(10001);
      expect(validatePrompt(emoji10001)).toMatch(/[\u0400-\u04FF]/);
    });
  });

  describe('comparisonReducer: catalog-loaded', () => {
    it('stores catalog and initializes first 3 models when turns are empty', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const nextState = comparisonReducer(initialState, {
        type: 'catalog-loaded',
        catalog: mockCatalog,
      });

      expect(nextState.catalog).toEqual(mockCatalog);
      expect(nextState.models).toHaveLength(3);
      expect(nextState.models).toEqual(mockCatalog.slice(0, 3));
      expect(nextState.turns).toEqual([]);
    });

    it('initializes fewer models if catalog has fewer than 3 models', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const twoModels = mockCatalog.slice(0, 2);
      const nextState = comparisonReducer(initialState, {
        type: 'catalog-loaded',
        catalog: twoModels,
      });

      expect(nextState.models).toEqual(twoModels);
    });

    it('preserves current model selection if turns already exist', () => {
      const stateWithTurns = deepFreeze({
        catalog: mockCatalog,
        models: [mockCatalog[0], mockCatalog[1]],
        turns: [
          {
            id: 't-1',
            question: 'q',
            answers: {},
          },
        ],
      });

      const nextState = comparisonReducer(stateWithTurns, {
        type: 'catalog-loaded',
        catalog: mockCatalog,
      });

      expect(nextState.models).toEqual([mockCatalog[0], mockCatalog[1]]);
    });
  });

  describe('comparisonReducer: send and resolve lifecycle', () => {
    function setupReadyState() {
      return deepFreeze(
        comparisonReducer(createInitialComparisonState(), {
          type: 'catalog-loaded',
          catalog: mockCatalog,
        }),
      );
    }

    it('creates a new turn with pending answers for each active model', () => {
      const state = setupReadyState();
      const nextState = comparisonReducer(state, {
        type: 'send',
        turnId: 'turn-1',
        prompt: 'Explain quantum computing',
        requests: {
          'openai/gpt-5-mini': 'req-1',
          'anthropic/claude-3-haiku': 'req-2',
          'google/gemini-2.5-flash': 'req-3',
        },
      });

      expect(nextState.turns).toHaveLength(1);
      const turn = nextState.turns[0];
      expect(turn.id).toBe('turn-1');
      expect(turn.question).toBe('Explain quantum computing');

      for (const model of state.models) {
        const ans = turn.answers[model.id];
        expect(ans).toBeDefined();
        expect(ans?.state).toBe('pending');
      }
      expect(turn.answers['openai/gpt-5-mini']).toEqual({
        state: 'pending',
        requestId: 'req-1',
      });
    });

    it('rejects send when model count is not in 2..4', () => {
      const emptyState = deepFreeze(createInitialComparisonState());
      expect(
        comparisonReducer(emptyState, {
          type: 'send',
          turnId: 'turn-1',
          prompt: 'test',
          requests: {},
        }),
      ).toBe(emptyState);
    });

    it('rejects send when prompt is invalid or turnId is duplicate', () => {
      const state = setupReadyState();
      const invalidPromptState = comparisonReducer(state, {
        type: 'send',
        turnId: 'turn-1',
        prompt: '   ',
        requests: {
          'openai/gpt-5-mini': 'req-1',
          'anthropic/claude-3-haiku': 'req-2',
          'google/gemini-2.5-flash': 'req-3',
        },
      });
      expect(invalidPromptState).toBe(state);

      const stateWithTurn = deepFreeze(
        comparisonReducer(state, {
          type: 'send',
          turnId: 'turn-1',
          prompt: 'first',
          requests: {
            'openai/gpt-5-mini': 'req-1',
            'anthropic/claude-3-haiku': 'req-2',
            'google/gemini-2.5-flash': 'req-3',
          },
        }),
      );

      const duplicateTurnState = comparisonReducer(stateWithTurn, {
        type: 'send',
        turnId: 'turn-1',
        prompt: 'second',
        requests: {
          'openai/gpt-5-mini': 'req-4',
          'anthropic/claude-3-haiku': 'req-5',
          'google/gemini-2.5-flash': 'req-6',
        },
      });
      expect(duplicateTurnState).toBe(stateWithTurn);
    });

    it('rejects send if requestIds are missing, empty, or duplicate across models', () => {
      const state = setupReadyState();
      // Duplicate req-1
      const duplicateReqState = comparisonReducer(state, {
        type: 'send',
        turnId: 'turn-1',
        prompt: 'test',
        requests: {
          'openai/gpt-5-mini': 'req-1',
          'anthropic/claude-3-haiku': 'req-1',
          'google/gemini-2.5-flash': 'req-3',
        },
      });
      expect(duplicateReqState).toBe(state);

      // Missing model
      const missingReqState = comparisonReducer(state, {
        type: 'send',
        turnId: 'turn-1',
        prompt: 'test',
        requests: {
          'openai/gpt-5-mini': 'req-1',
          'anthropic/claude-3-haiku': 'req-2',
        },
      });
      expect(missingReqState).toBe(state);
    });

    it('resolves a pending answer to success when requestId matches', () => {
      const state = deepFreeze(
        comparisonReducer(setupReadyState(), {
          type: 'send',
          turnId: 'turn-1',
          prompt: 'test prompt',
          requests: {
            'openai/gpt-5-mini': 'req-1',
            'anthropic/claude-3-haiku': 'req-2',
            'google/gemini-2.5-flash': 'req-3',
          },
        }),
      );

      const resolvedAnswer: Exclude<ResultAnswer, { state: 'pending' }> = {
        state: 'success',
        markdown: 'GPT answer',
        durationLabel: '1,2 с',
      };

      const nextState = comparisonReducer(state, {
        type: 'resolve',
        turnId: 'turn-1',
        modelId: 'openai/gpt-5-mini',
        requestId: 'req-1',
        answer: resolvedAnswer,
      });

      expect(nextState.turns[0].answers['openai/gpt-5-mini']).toEqual({
        state: 'success',
        markdown: 'GPT answer',
        durationLabel: '1,2 с',
        requestId: 'req-1',
      });
      // Other models remain pending
      expect(nextState.turns[0].answers['anthropic/claude-3-haiku']?.state).toBe('pending');
      expect(nextState.turns[0].answers['google/gemini-2.5-flash']?.state).toBe('pending');
    });

    it('ignores resolve if requestId does not match pending requestId', () => {
      const state = deepFreeze(
        comparisonReducer(setupReadyState(), {
          type: 'send',
          turnId: 'turn-1',
          prompt: 'test prompt',
          requests: {
            'openai/gpt-5-mini': 'req-1',
            'anthropic/claude-3-haiku': 'req-2',
            'google/gemini-2.5-flash': 'req-3',
          },
        }),
      );

      const nextState = comparisonReducer(state, {
        type: 'resolve',
        turnId: 'turn-1',
        modelId: 'openai/gpt-5-mini',
        requestId: 'wrong-req-id',
        answer: {
          state: 'success',
          markdown: 'Late GPT answer',
          durationLabel: '1,2 с',
        },
      });

      expect(nextState).toBe(state);
      expect(nextState.turns[0].answers['openai/gpt-5-mini']?.state).toBe('pending');
    });

    it('ignores resolve if answer is already resolved (not pending)', () => {
      const stateWithResolved = deepFreeze(
        comparisonReducer(
          comparisonReducer(setupReadyState(), {
            type: 'send',
            turnId: 'turn-1',
            prompt: 'test prompt',
            requests: {
              'openai/gpt-5-mini': 'req-1',
              'anthropic/claude-3-haiku': 'req-2',
              'google/gemini-2.5-flash': 'req-3',
            },
          }),
          {
            type: 'resolve',
            turnId: 'turn-1',
            modelId: 'openai/gpt-5-mini',
            requestId: 'req-1',
            answer: {
              state: 'success',
              markdown: 'First answer',
              durationLabel: '1,0 с',
            },
          },
        ),
      );

      const nextState = comparisonReducer(stateWithResolved, {
        type: 'resolve',
        turnId: 'turn-1',
        modelId: 'openai/gpt-5-mini',
        requestId: 'req-1',
        answer: {
          state: 'success',
          markdown: 'Second answer attempting overwrite',
          durationLabel: '2,0 с',
        },
      });

      expect(nextState).toBe(stateWithResolved);
      expect(
        (nextState.turns[0].answers['openai/gpt-5-mini'] as { markdown?: string })?.markdown,
      ).toBe('First answer');
    });

    it('retries only error answers, sets them to pending with new requestId, and keeps others unchanged', () => {
      // Setup turn where claude has an error
      const stateWithError = deepFreeze(
        comparisonReducer(
          comparisonReducer(setupReadyState(), {
            type: 'send',
            turnId: 'turn-1',
            prompt: 'question',
            requests: {
              'openai/gpt-5-mini': 'req-1',
              'anthropic/claude-3-haiku': 'req-2',
              'google/gemini-2.5-flash': 'req-3',
            },
          }),
          {
            type: 'resolve',
            turnId: 'turn-1',
            modelId: 'anthropic/claude-3-haiku',
            requestId: 'req-2',
            answer: {
              state: 'error',
              message: 'Timeout error',
              description: 'Try again',
            },
          },
        ),
      );

      // Attempting to retry a model that is pending -> ignored
      const retryPending = comparisonReducer(stateWithError, {
        type: 'retry',
        turnId: 'turn-1',
        modelId: 'openai/gpt-5-mini',
        requestId: 'new-req-gpt',
      });
      expect(retryPending).toBe(stateWithError);

      // Retrying the error cell
      const retriedState = comparisonReducer(stateWithError, {
        type: 'retry',
        turnId: 'turn-1',
        modelId: 'anthropic/claude-3-haiku',
        requestId: 'req-retry-claude-1',
      });

      expect(retriedState.turns[0].answers['anthropic/claude-3-haiku']).toEqual({
        state: 'pending',
        requestId: 'req-retry-claude-1',
      });
      expect(retriedState.turns[0].question).toBe('question');
    });
  });

  describe('comparisonReducer: model selection and limits', () => {
    function setupReadyState() {
      return deepFreeze(
        comparisonReducer(createInitialComparisonState(), {
          type: 'catalog-loaded',
          catalog: mockCatalog,
        }),
      );
    }

    it('adds a 4th model from catalog and preserves existing turns without backfill', () => {
      const state = setupReadyState();
      expect(state.models).toHaveLength(3);

      const stateWith4 = comparisonReducer(state, {
        type: 'select-model',
        modelId: 'meta/llama-3.3-70b',
      });

      expect(stateWith4.models).toHaveLength(4);
      expect(stateWith4.models[3].id).toBe('meta/llama-3.3-70b');

      // Attempting to add 5th model -> rejected
      const stateWith5 = comparisonReducer(stateWith4, {
        type: 'select-model',
        modelId: 'deepseek/deepseek-chat',
      });
      expect(stateWith5).toBe(stateWith4);
    });

    it('rejects adding duplicate or unknown models', () => {
      const state = setupReadyState();
      const duplicate = comparisonReducer(state, {
        type: 'select-model',
        modelId: 'openai/gpt-5-mini',
      });
      expect(duplicate).toBe(state);

      const unknown = comparisonReducer(state, {
        type: 'select-model',
        modelId: 'nonexistent/model',
      });
      expect(unknown).toBe(state);
    });

    it('removes model down to minimum 2 and strips answers from turns', () => {
      const state = deepFreeze(
        comparisonReducer(setupReadyState(), {
          type: 'send',
          turnId: 't-1',
          prompt: 'q',
          requests: {
            'openai/gpt-5-mini': 'r-1',
            'anthropic/claude-3-haiku': 'r-2',
            'google/gemini-2.5-flash': 'r-3',
          },
        }),
      );

      const stateWith2 = comparisonReducer(state, {
        type: 'remove-model',
        modelId: 'google/gemini-2.5-flash',
      });

      expect(stateWith2.models).toHaveLength(2);
      expect(stateWith2.turns[0].answers['google/gemini-2.5-flash']).toBeUndefined();
      expect(stateWith2.turns[0].answers['openai/gpt-5-mini']).toBeDefined();

      // Attempting to remove down to 1 model -> rejected
      const stateWith1 = comparisonReducer(stateWith2, {
        type: 'remove-model',
        modelId: 'anthropic/claude-3-haiku',
      });
      expect(stateWith1).toBe(stateWith2);
    });

    it('re-adding a previously removed model does not resurrect old answers', () => {
      const stateWithTurn = deepFreeze(
        comparisonReducer(setupReadyState(), {
          type: 'send',
          turnId: 't-1',
          prompt: 'q',
          requests: {
            'openai/gpt-5-mini': 'r-1',
            'anthropic/claude-3-haiku': 'r-2',
            'google/gemini-2.5-flash': 'r-3',
          },
        }),
      );

      const stateRemoved = deepFreeze(
        comparisonReducer(stateWithTurn, {
          type: 'remove-model',
          modelId: 'google/gemini-2.5-flash',
        }),
      );

      const stateReAdded = comparisonReducer(stateRemoved, {
        type: 'select-model',
        modelId: 'google/gemini-2.5-flash',
      });

      expect(stateReAdded.models).toHaveLength(3);
      expect(stateReAdded.turns[0].answers['google/gemini-2.5-flash']).toBeUndefined();
    });
  });

  describe('comparisonReducer: new-comparison', () => {
    it('clears all turns while preserving catalog and model selection', () => {
      const stateWithTurns = deepFreeze(
        comparisonReducer(
          comparisonReducer(createInitialComparisonState(), {
            type: 'catalog-loaded',
            catalog: mockCatalog,
          }),
          {
            type: 'send',
            turnId: 't-1',
            prompt: 'q',
            requests: {
              'openai/gpt-5-mini': 'r-1',
              'anthropic/claude-3-haiku': 'r-2',
              'google/gemini-2.5-flash': 'r-3',
            },
          },
        ),
      );

      const clearedState = comparisonReducer(stateWithTurns, {
        type: 'new-comparison',
      });

      expect(clearedState.turns).toEqual([]);
      expect(clearedState.catalog).toEqual(mockCatalog);
      expect(clearedState.models).toHaveLength(3);
    });
  });
});
