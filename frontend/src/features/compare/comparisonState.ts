import { desktopModels, desktopTurns } from './desktopFixtures';
import { createMockAnswer, mockModelCatalog } from './mockComparison';
import type { CompareModel, CompareTurn, ResultAnswer } from './types';

export type ComparisonState = {
  models: readonly CompareModel[];
  turns: readonly CompareTurn[];
};

export type ComparisonStateAction =
  | { type: 'send'; turnId: string; prompt: string }
  | { type: 'select-model'; modelId: string }
  | { type: 'remove-model'; modelId: string }
  | { type: 'retry'; turnId: string; modelId: string }
  | { type: 'new-comparison' };

export function createInitialComparisonState(): ComparisonState {
  return {
    models: desktopModels.map((model) => ({ ...model })),
    turns: desktopTurns.map((turn) => ({
      ...turn,
      answers: Object.fromEntries(
        Object.entries(turn.answers).map(([key, ans]) => [
          key,
          ans
            ? {
                ...ans,
                ...(ans.state === 'success' && ans.thought ? { thought: { ...ans.thought } } : {}),
              }
            : undefined,
        ]),
      ),
    })),
  };
}

export function validatePrompt(prompt: string): string | null {
  if (prompt.trim().length === 0) {
    return 'Вопрос не может быть пустым.';
  }

  const codePointCount = Array.from(prompt).length;
  if (codePointCount > 10000) {
    return 'Вопрос не может превышать 10 000 символов.';
  }

  return null;
}

export function comparisonReducer(
  state: ComparisonState,
  action: ComparisonStateAction,
): ComparisonState {
  switch (action.type) {
    case 'send': {
      if (validatePrompt(action.prompt) !== null) {
        return state;
      }

      if (state.turns.some((turn) => turn.id === action.turnId)) {
        return state;
      }

      const answers: Record<string, ResultAnswer> = {};
      for (const model of state.models) {
        answers[model.id] = createMockAnswer(model);
      }

      const newTurn: CompareTurn = {
        id: action.turnId,
        question: action.prompt,
        answers,
      };

      return {
        ...state,
        turns: [...state.turns, newTurn],
      };
    }

    case 'select-model': {
      if (state.models.length >= 4) {
        return state;
      }

      if (state.models.some((model) => model.id === action.modelId)) {
        return state;
      }

      const modelToAdd = mockModelCatalog.find((model) => model.id === action.modelId);
      if (!modelToAdd) {
        return state;
      }

      return {
        ...state,
        models: [...state.models, { ...modelToAdd }],
      };
    }

    case 'remove-model': {
      if (state.models.length <= 2) {
        return state;
      }

      if (!state.models.some((model) => model.id === action.modelId)) {
        return state;
      }

      const nextModels = state.models.filter((model) => model.id !== action.modelId);
      const nextTurns = state.turns.map((turn) => {
        const { [action.modelId]: _, ...remainingAnswers } = turn.answers;
        return {
          ...turn,
          answers: remainingAnswers,
        };
      });

      return {
        ...state,
        models: nextModels,
        turns: nextTurns,
      };
    }

    case 'retry': {
      const targetModel = state.models.find((model) => model.id === action.modelId);
      if (!targetModel) {
        return state;
      }

      const turnIndex = state.turns.findIndex((turn) => turn.id === action.turnId);
      if (turnIndex === -1) {
        return state;
      }

      const targetTurn = state.turns[turnIndex];
      const targetAnswer = targetTurn.answers[action.modelId];
      if (!targetAnswer || targetAnswer.state !== 'error') {
        return state;
      }

      const updatedAnswers = {
        ...targetTurn.answers,
        [action.modelId]: createMockAnswer(targetModel),
      };

      const updatedTurn: CompareTurn = {
        ...targetTurn,
        answers: updatedAnswers,
      };

      const nextTurns = [...state.turns];
      nextTurns[turnIndex] = updatedTurn;

      return {
        ...state,
        turns: nextTurns,
      };
    }

    case 'new-comparison': {
      return {
        ...state,
        turns: [],
      };
    }

    default:
      return state;
  }
}
