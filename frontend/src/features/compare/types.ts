export type CompareModel = {
  id: string;
  name: string;
  provider: string;
};

export type ResultAnswer =
  | {
      state: 'pending';
      requestId: string;
    }
  | {
      state: 'streaming';
      requestId: string;
      markdown: string;
      reasoning: string;
    }
  | {
      state: 'stopped';
      requestId: string;
      markdown: string;
      reasoning: string;
    }
  | {
      state: 'success';
      markdown: string;
      durationLabel: string;
      costLabel?: string;
      requestId?: string;
      thought?: { text: string; durationSeconds?: number };
    }
  | {
      state: 'error';
      message: string;
      description: string;
      requestId?: string;
      markdown?: string;
      reasoning?: string;
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
  | { type: 'stop'; turnId: string; modelId: string }
  | { type: 'send'; prompt: string };
