import type { CompareModel } from './types.js';

export type GenerateResponse = { modelId: string; text: string; durationMs: number };

export type ComparisonApiErrorCode =
  | 'INVALID_REQUEST'
  | 'GENERATION_UNAVAILABLE'
  | 'UPSTREAM_AUTH_ERROR'
  | 'UPSTREAM_LIMIT_EXCEEDED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';

const ERROR_MESSAGES: Record<ComparisonApiErrorCode, string> = {
  INVALID_REQUEST: 'Некорректный запрос.',
  GENERATION_UNAVAILABLE: 'Генерация недоступна.',
  UPSTREAM_AUTH_ERROR: 'Ошибка настройки сервиса.',
  UPSTREAM_LIMIT_EXCEEDED: 'Лимит запросов исчерпан.',
  UPSTREAM_TIMEOUT: 'Время ожидания истекло.',
  UPSTREAM_ERROR: 'Не удалось получить ответ.',
  UPSTREAM_INVALID_RESPONSE: 'Некорректный ответ сервиса.',
  NETWORK_ERROR: 'Не удалось связаться с сервером.',
  INVALID_RESPONSE: 'Некорректный ответ сервиса.',
};

export class ComparisonApiError extends Error {
  readonly code: ComparisonApiErrorCode;

  constructor(code: ComparisonApiErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ComparisonApiError';
    this.code = code;
  }
}

const ENVELOPE_CODES = new Set<ComparisonApiErrorCode>([
  'INVALID_REQUEST',
  'GENERATION_UNAVAILABLE',
  'UPSTREAM_AUTH_ERROR',
  'UPSTREAM_LIMIT_EXCEEDED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'UPSTREAM_INVALID_RESPONSE',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapStatusToFallbackCode(status: number): ComparisonApiErrorCode {
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 429) return 'UPSTREAM_LIMIT_EXCEEDED';
  if (status === 503) return 'GENERATION_UNAVAILABLE';
  if (status === 504) return 'UPSTREAM_TIMEOUT';
  return 'UPSTREAM_ERROR';
}

async function handleHttpError(response: Response, signal: AbortSignal): Promise<never> {
  try {
    const json = await response.json();
    if (isPlainRecord(json) && isPlainRecord(json.error)) {
      const code = json.error.code;
      if (typeof code === 'string' && ENVELOPE_CODES.has(code as ComparisonApiErrorCode)) {
        throw new ComparisonApiError(code as ComparisonApiErrorCode);
      }
    }
  } catch (err: unknown) {
    if (signal.aborted || err instanceof ComparisonApiError) {
      throw err;
    }
  }
  throw new ComparisonApiError(mapStatusToFallbackCode(response.status));
}

export async function fetchModels(signal: AbortSignal): Promise<CompareModel[]> {
  let response: Response;
  try {
    response = await fetch('/api/models', { signal });
  } catch (err: unknown) {
    if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    throw new ComparisonApiError('NETWORK_ERROR');
  }

  if (response.status !== 200) {
    return handleHttpError(response, signal);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err: unknown) {
    if (signal.aborted) throw err;
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  if (!isPlainRecord(json) || !Array.isArray(json.models)) {
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  const models: CompareModel[] = [];
  const seenIds = new Set<string>();

  for (const item of json.models) {
    if (!isPlainRecord(item)) {
      throw new ComparisonApiError('INVALID_RESPONSE');
    }
    const { id, name, provider } = item;
    if (
      typeof id !== 'string' ||
      id === '' ||
      id.trim() !== id ||
      typeof name !== 'string' ||
      name === '' ||
      name.trim() !== name ||
      typeof provider !== 'string' ||
      provider === '' ||
      provider.trim() !== provider
    ) {
      throw new ComparisonApiError('INVALID_RESPONSE');
    }

    if (seenIds.has(id)) {
      throw new ComparisonApiError('INVALID_RESPONSE');
    }
    seenIds.add(id);

    models.push({ id, name, provider });
  }

  return models;
}

export async function generateAnswer(
  input: { prompt: string; modelId: string },
  signal: AbortSignal,
): Promise<GenerateResponse> {
  let response: Response;
  try {
    response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        modelId: input.modelId,
      }),
      signal,
    });
  } catch (err: unknown) {
    if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    throw new ComparisonApiError('NETWORK_ERROR');
  }

  if (response.status !== 200) {
    return handleHttpError(response, signal);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err: unknown) {
    if (signal.aborted) throw err;
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  if (!isPlainRecord(json)) {
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  const { modelId, text, durationMs } = json;

  if (
    typeof modelId !== 'string' ||
    modelId !== input.modelId ||
    typeof text !== 'string' ||
    typeof durationMs !== 'number' ||
    !Number.isFinite(durationMs) ||
    durationMs < 0
  ) {
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  return { modelId, text, durationMs };
}
