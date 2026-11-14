import type { CompareModel, CompareTurn, ResultAnswer } from './types.js';

export type ComparisonState = {
  catalog: readonly CompareModel[];
  models: readonly CompareModel[];
  turns: readonly CompareTurn[];
};

export type ComparisonStateAction =
  | { type: 'catalog-loaded'; catalog: CompareModel[] }
  | { type: 'send'; turnId: string; prompt: string; requests: Record<string, string> }
  | { type: 'retry'; turnId: string; modelId: string; requestId: string }
  | {
      type: 'resolve';
      turnId: string;
      modelId: string;
      requestId: string;
      answer: Exclude<ResultAnswer, { state: 'pending' }>;
    }
  | { type: 'select-model'; modelId: string }
  | { type: 'remove-model'; modelId: string }
  | { type: 'new-comparison' };

export function createInitialComparisonState(): ComparisonState {
  return {
    catalog: [],
    models: [],
    turns: [],
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
    case 'catalog-loaded': {
      const nextCatalog = action.catalog.map((m) => ({ ...m }));
      return {
        ...state,
        catalog: nextCatalog,
        models: state.turns.length === 0 ? nextCatalog.slice(0, 3) : state.models,
      };
    }

    case 'send': {
      if (validatePrompt(action.prompt) !== null) {
        return state;
      }

      if (state.models.length < 2 || state.models.length > 4) {
        return state;
      }

      if (state.turns.some((turn) => turn.id === action.turnId)) {
        return state;
      }

      if (Object.keys(action.requests).length !== state.models.length) return state;
      const seenRequestIds = new Set<string>();
      for (const model of state.models) {
        const reqId = action.requests[model.id];
        if (typeof reqId !== 'string' || reqId.trim() === '' || seenRequestIds.has(reqId)) {
          return state;
        }
        seenRequestIds.add(reqId);
      }

      const answers: Record<string, ResultAnswer> = {};
      for (const model of state.models) {
        answers[model.id] = {
          state: 'pending',
          requestId: action.requests[model.id],
        };
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

    case 'retry': {
      if (
        !action.requestId ||
        typeof action.requestId !== 'string' ||
        action.requestId.trim() === ''
      ) {
        return state;
      }

      if (!state.models.some((model) => model.id === action.modelId)) {
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

      const updatedAnswers: Record<string, ResultAnswer | undefined> = {
        ...targetTurn.answers,
        [action.modelId]: {
          state: 'pending',
          requestId: action.requestId,
        },
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

    case 'resolve': {
      if (!state.models.some((model) => model.id === action.modelId)) {
        return state;
      }

      const turnIndex = state.turns.findIndex((turn) => turn.id === action.turnId);
      if (turnIndex === -1) {
        return state;
      }

      const targetTurn = state.turns[turnIndex];
      const targetAnswer = targetTurn.answers[action.modelId];
      if (
        !targetAnswer ||
        targetAnswer.state !== 'pending' ||
        targetAnswer.requestId !== action.requestId
      ) {
        return state;
      }

      const updatedAnswers: Record<string, ResultAnswer | undefined> = {
        ...targetTurn.answers,
        [action.modelId]: {
          ...action.answer,
          requestId: action.requestId,
        },
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

    case 'select-model': {
      if (state.models.length >= 4) {
        return state;
      }

      if (state.models.some((model) => model.id === action.modelId)) {
        return state;
      }

      const modelToAdd = state.catalog.find((model) => model.id === action.modelId);
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
