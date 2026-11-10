export type CompareModel = {
  id: string;
  name: string;
  provider: string;
};

export type ResultAnswer =
  | {
      state: 'success';
      markdown: string;
      durationLabel: string;
      costLabel: string;
      thought?: { text: string; durationSeconds: number };
    }
  | {
      state: 'error';
      message: string;
      description: string;
    };

export type CompareTurn = {
  id: string;
  question: string;
  answers: Record<string, ResultAnswer | undefined>;
};

export type CompareAction =
  | { type: 'share' }
  | { type: 'new-comparison' }
  | { type: 'add-model' }
  | { type: 'remove-model'; modelId: string }
  | { type: 'retry'; turnId: string; modelId: string }
  | { type: 'send'; prompt: string };

