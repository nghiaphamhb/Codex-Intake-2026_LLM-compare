import { describe, expect, it } from 'vitest';
import { desktopModels, desktopTurns } from './desktopFixtures';
import { comparisonReducer, createInitialComparisonState, validatePrompt } from './comparisonState';

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

describe('comparisonState', () => {
  describe('createInitialComparisonState', () => {
    it('returns a deep-copied initial state matching desktop fixtures without mutating them', () => {
      const state = createInitialComparisonState();

      expect(state.models).toHaveLength(desktopModels.length);
      expect(state.turns).toHaveLength(desktopTurns.length);
      expect(state.models).toEqual(desktopModels);
      expect(state.turns).toEqual(desktopTurns);

      // Verify deep clone: mutating state does not affect desktopFixtures
      const firstTurn = state.turns[0];
      const firstAnswer = firstTurn.answers['claude-demo'];
      expect(firstAnswer).toBeDefined();
      if (firstAnswer && firstAnswer.state === 'success') {
        const originalDuration =
          desktopTurns[0].answers['claude-demo']?.state === 'success'
            ? desktopTurns[0].answers['claude-demo'].durationLabel
            : '';
        (firstAnswer as { durationLabel: string }).durationLabel = '999 с';
        expect(
          desktopTurns[0].answers['claude-demo']?.state === 'success'
            ? desktopTurns[0].answers['claude-demo'].durationLabel
            : '',
        ).toBe(originalDuration);
      }
    });
  });

  describe('validatePrompt', () => {
    it('returns null for valid prompts', () => {
      expect(validatePrompt('Привет, расскажи о проекте')).toBeNull();
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
      // 🚀 is 2 UTF-16 code units but 1 Unicode code point
      const emoji10k = '🚀'.repeat(10000);
      expect(emoji10k.length).toBe(20000); // 20k UTF-16 code units
      expect(validatePrompt(emoji10k)).toBeNull(); // Exactly 10k code points

      const emoji10001 = '🚀'.repeat(10001);
      expect(validatePrompt(emoji10001)).toMatch(/[\u0400-\u04FF]/);
    });
  });

  describe('comparisonReducer: send action', () => {
    it('appends a new turn with answers generated for all active models in order', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const promptText = '  Первая строка\nВторая строка  ';

      const nextState = comparisonReducer(initialState, {
        type: 'send',
        turnId: 'turn-new-1',
        prompt: promptText,
      });

      expect(nextState.turns).toHaveLength(initialState.turns.length + 1);
      const addedTurn = nextState.turns[nextState.turns.length - 1];
      expect(addedTurn.id).toBe('turn-new-1');
      expect(addedTurn.question).toBe(promptText);

      // Verify answers exist for all models in state
      for (const model of nextState.models) {
        const answer = addedTurn.answers[model.id];
        expect(answer).toBeDefined();
        expect(answer?.state).toBe('success');
        if (answer?.state === 'success') {
          expect(answer.markdown).toContain(model.name);
          expect(answer.durationLabel).toBe('0,0 с');
          expect(answer.costLabel).toBe('$0,0000');
        }
      }
    });

    it('ignores duplicate turnId and preserves state', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const existingTurnId = initialState.turns[0].id;

      const nextState = comparisonReducer(initialState, {
        type: 'send',
        turnId: existingTurnId,
        prompt: 'Новый вопрос',
      });

      expect(nextState).toBe(initialState);
      expect(nextState.turns).toHaveLength(initialState.turns.length);
    });

    it('ignores send action when prompt is invalid', () => {
      const initialState = deepFreeze(createInitialComparisonState());

      const whitespaceState = comparisonReducer(initialState, {
        type: 'send',
        turnId: 'turn-invalid-1',
        prompt: '   \n  ',
      });
      expect(whitespaceState).toBe(initialState);

      const tooLongState = comparisonReducer(initialState, {
        type: 'send',
        turnId: 'turn-invalid-2',
        prompt: 'x'.repeat(10001),
      });
      expect(tooLongState).toBe(initialState);
    });

    it('handles two consecutive sends with unique turn IDs', () => {
      const initialState = deepFreeze(createInitialComparisonState());

      const stateAfterFirst = deepFreeze(
        comparisonReducer(initialState, {
          type: 'send',
          turnId: 'turn-seq-1',
          prompt: 'Первый вопрос',
        }),
      );
      expect(stateAfterFirst.turns).toHaveLength(initialState.turns.length + 1);

      const stateAfterSecond = comparisonReducer(stateAfterFirst, {
        type: 'send',
        turnId: 'turn-seq-2',
        prompt: 'Второй вопрос',
      });
      expect(stateAfterSecond.turns).toHaveLength(initialState.turns.length + 2);
      expect(stateAfterSecond.turns[stateAfterSecond.turns.length - 2].id).toBe('turn-seq-1');
      expect(stateAfterSecond.turns[stateAfterSecond.turns.length - 1].id).toBe('turn-seq-2');
    });
  });

  describe('comparisonReducer: select-model action', () => {
    it('appends a valid model from the catalog and preserves existing turns without backfilling answers', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      expect(initialState.models).toHaveLength(3);

      const nextState = comparisonReducer(initialState, {
        type: 'select-model',
        modelId: 'demo-alpha',
      });

      expect(nextState.models).toHaveLength(4);
      expect(nextState.models[3].id).toBe('demo-alpha');
      expect(nextState.turns).toEqual(initialState.turns);
      // Ensure existing turns do not have an answer for demo-alpha
      for (const turn of nextState.turns) {
        expect(turn.answers['demo-alpha']).toBeUndefined();
      }
    });

    it('rejects unknown model IDs and preserves state', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const nextState = comparisonReducer(initialState, {
        type: 'select-model',
        modelId: 'unknown-model-xyz',
      });
      expect(nextState).toBe(initialState);
    });

    it('rejects duplicate model IDs and preserves state', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const existingModelId = initialState.models[0].id;
      const nextState = comparisonReducer(initialState, {
        type: 'select-model',
        modelId: existingModelId,
      });
      expect(nextState).toBe(initialState);
    });

    it('rejects adding a fifth model when four models are already selected', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const stateWithFour = deepFreeze(
        comparisonReducer(initialState, {
          type: 'select-model',
          modelId: 'demo-alpha',
        }),
      );
      expect(stateWithFour.models).toHaveLength(4);

      const stateAttemptFive = comparisonReducer(stateWithFour, {
        type: 'select-model',
        modelId: 'demo-beta',
      });
      expect(stateAttemptFive).toBe(stateWithFour);
      expect(stateAttemptFive.models).toHaveLength(4);
    });
  });

  describe('comparisonReducer: remove-model action', () => {
    it('removes the specified model and removes its answers from all turns', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const modelToRemove = initialState.models[1]; // yandex-demo

      const nextState = comparisonReducer(initialState, {
        type: 'remove-model',
        modelId: modelToRemove.id,
      });

      expect(nextState.models).toHaveLength(2);
      expect(nextState.models.map((m) => m.id)).toEqual([
        initialState.models[0].id,
        initialState.models[2].id,
      ]);

      for (const turn of nextState.turns) {
        expect(turn.answers[modelToRemove.id]).toBeUndefined();
        expect(turn.answers[initialState.models[0].id]).toBeDefined();
        expect(turn.answers[initialState.models[2].id]).toBeDefined();
      }
    });

    it('rejects removal when only 2 models remain', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const stateWithTwo = deepFreeze(
        comparisonReducer(initialState, {
          type: 'remove-model',
          modelId: initialState.models[0].id,
        }),
      );
      expect(stateWithTwo.models).toHaveLength(2);

      const stateAttemptBelowMin = comparisonReducer(stateWithTwo, {
        type: 'remove-model',
        modelId: stateWithTwo.models[0].id,
      });
      expect(stateAttemptBelowMin).toBe(stateWithTwo);
      expect(stateAttemptBelowMin.models).toHaveLength(2);
    });

    it('ignores removal of unknown model ID', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const nextState = comparisonReducer(initialState, {
        type: 'remove-model',
        modelId: 'nonexistent-model',
      });
      expect(nextState).toBe(initialState);
    });

    it('does not revive deleted answers if the removed model is added again later', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const removedId = initialState.models[1].id;

      const stateAfterRemove = deepFreeze(
        comparisonReducer(initialState, {
          type: 'remove-model',
          modelId: removedId,
        }),
      );
      expect(stateAfterRemove.models).toHaveLength(2);

      const stateAfterReAdd = comparisonReducer(stateAfterRemove, {
        type: 'select-model',
        modelId: removedId,
      });
      expect(stateAfterReAdd.models).toHaveLength(3);
      expect(stateAfterReAdd.models[2].id).toBe(removedId);

      // Verify previous turns still do NOT have answers for this model
      for (const turn of stateAfterReAdd.turns) {
        expect(turn.answers[removedId]).toBeUndefined();
      }
    });
  });

  describe('comparisonReducer: retry action', () => {
    it('replaces an error answer with a new mock success answer for the specified model', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      // In desktopFixtures, turn-1 has an error for 'giga-demo'
      expect(initialState.turns[0].answers['giga-demo']?.state).toBe('error');

      const nextState = comparisonReducer(initialState, {
        type: 'retry',
        turnId: 'turn-1',
        modelId: 'giga-demo',
      });

      expect(nextState.turns).toHaveLength(initialState.turns.length);
      const retriedAnswer = nextState.turns[0].answers['giga-demo'];
      expect(retriedAnswer).toBeDefined();
      expect(retriedAnswer?.state).toBe('success');
      if (retriedAnswer?.state === 'success') {
        expect(retriedAnswer.markdown).toContain('GigaChat 2');
        expect(retriedAnswer.durationLabel).toBe('0,0 с');
        expect(retriedAnswer.costLabel).toBe('$0,0000');
      }

      // Other answers in the same turn remain untouched
      expect(nextState.turns[0].answers['claude-demo']).toBe(
        initialState.turns[0].answers['claude-demo'],
      );
      expect(nextState.turns[0].answers['yandex-demo']).toBe(
        initialState.turns[0].answers['yandex-demo'],
      );

      // Other turns remain untouched
      expect(nextState.turns[1]).toBe(initialState.turns[1]);
    });

    it('ignores retry when the answer is already successful', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const nextState = comparisonReducer(initialState, {
        type: 'retry',
        turnId: 'turn-1',
        modelId: 'claude-demo',
      });
      expect(nextState).toBe(initialState);
    });

    it('ignores retry when the answer is missing (undefined)', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      // Add demo-alpha (which has no answer in turn-1)
      const stateWithAdded = deepFreeze(
        comparisonReducer(initialState, {
          type: 'select-model',
          modelId: 'demo-alpha',
        }),
      );
      expect(stateWithAdded.turns[0].answers['demo-alpha']).toBeUndefined();

      const nextState = comparisonReducer(stateWithAdded, {
        type: 'retry',
        turnId: 'turn-1',
        modelId: 'demo-alpha',
      });
      expect(nextState).toBe(stateWithAdded);
    });

    it('ignores retry with non-existent turnId or modelId', () => {
      const initialState = deepFreeze(createInitialComparisonState());

      const badTurnState = comparisonReducer(initialState, {
        type: 'retry',
        turnId: 'non-existent-turn',
        modelId: 'giga-demo',
      });
      expect(badTurnState).toBe(initialState);

      const badModelState = comparisonReducer(initialState, {
        type: 'retry',
        turnId: 'turn-1',
        modelId: 'non-existent-model',
      });
      expect(badModelState).toBe(initialState);
    });
  });

  describe('comparisonReducer: new-comparison action', () => {
    it('resets turns to empty while preserving selected models', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const nextState = comparisonReducer(initialState, {
        type: 'new-comparison',
      });

      expect(nextState.models).toBe(initialState.models);
      expect(nextState.turns).toEqual([]);
    });

    it('allows sending a new question after new-comparison starting fresh turns', () => {
      const initialState = deepFreeze(createInitialComparisonState());
      const clearedState = deepFreeze(
        comparisonReducer(initialState, {
          type: 'new-comparison',
        }),
      );

      const stateAfterSend = comparisonReducer(clearedState, {
        type: 'send',
        turnId: 'fresh-turn-1',
        prompt: 'Вопрос после очистки',
      });

      expect(stateAfterSend.turns).toHaveLength(1);
      expect(stateAfterSend.turns[0].id).toBe('fresh-turn-1');
      expect(stateAfterSend.turns[0].question).toBe('Вопрос после очистки');
      for (const model of stateAfterSend.models) {
        expect(stateAfterSend.turns[0].answers[model.id]?.state).toBe('success');
      }
    });
  });
});
