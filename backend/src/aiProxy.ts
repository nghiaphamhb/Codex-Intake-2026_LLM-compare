import type { AppConfig } from './config.js';
import { validateModels, type Model } from './models.js';
import { parseNdjson, NdjsonParseError } from './ndjson.js';

export interface GenerateInput {
  prompt: string;
  modelId: string;
}

export interface GenerateUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateResult {
  usage?: GenerateUsage;
  text: string;
  durationMs: number;
}

export type Generate = (input: GenerateInput) => Promise<GenerateResult>;

export type StreamDelta =
  { type: 'text-delta'; delta: string } | { type: 'reasoning-delta'; delta: string };

export interface StreamResult {
  durationMs: number;
  usage?: GenerateUsage;
}

export interface StreamOptions {
  signal: AbortSignal;
  onReady: (signal: AbortSignal) => Promise<void>;
  onDelta: (event: StreamDelta, signal: AbortSignal) => Promise<void>;
}

export type StreamGenerate = (
  input: GenerateInput,
  options: StreamOptions,
) => Promise<StreamResult>;

export type AiProxyErrorCode =
  | 'UPSTREAM_AUTH_ERROR'
  | 'UPSTREAM_LIMIT_EXCEEDED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_INVALID_RESPONSE';

const ERROR_DETAILS: Record<AiProxyErrorCode, { statusCode: number; message: string }> = {
  UPSTREAM_AUTH_ERROR: {
    statusCode: 502,
    message: 'Model service authentication failed',
  },
  UPSTREAM_LIMIT_EXCEEDED: {
    statusCode: 429,
    message: 'Model service limit exceeded',
  },
  UPSTREAM_TIMEOUT: {
    statusCode: 504,
    message: 'Model service timed out',
  },
  UPSTREAM_ERROR: {
    statusCode: 502,
    message: 'Model service request failed',
  },
  UPSTREAM_INVALID_RESPONSE: {
    statusCode: 502,
    message: 'Model service returned an invalid response',
  },
};

export class AiProxyError extends Error {
  readonly code: AiProxyErrorCode;
  readonly statusCode: number;

  constructor(code: AiProxyErrorCode) {
    const details = ERROR_DETAILS[code];
    super(details.message);
    this.name = 'AiProxyError';
    this.code = code;
    this.statusCode = details.statusCode;
  }
}

const PROVIDER_NAMES = new Map<string, string>([
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['google', 'Google'],
  ['deepseek', 'DeepSeek'],
  ['moonshotai', 'Moonshot AI'],
  ['spacexai', 'xAI'],
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getOwnProperty(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function deriveProvider(modelId: string): string {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex <= 0 || slashIndex === modelId.length - 1) {
    return 'Unknown';
  }
  const prefix = modelId.slice(0, slashIndex);
  return PROVIDER_NAMES.get(prefix) ?? prefix;
}

function parseCatalog(parsed: unknown): Model[] {
  if (!isPlainRecord(parsed)) {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  const rawModels = getOwnProperty(parsed, 'models');
  if (!Array.isArray(rawModels)) {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  const models: Model[] = [];
  for (const item of rawModels) {
    if (!isPlainRecord(item)) {
      throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
    }
    const id = getOwnProperty(item, 'id');
    const name = getOwnProperty(item, 'name');
    if (typeof id !== 'string' || typeof name !== 'string') {
      throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
    }
    const rawPricing = getOwnProperty(item, 'pricing');
    const input = isPlainRecord(rawPricing) ? getOwnProperty(rawPricing, 'input') : undefined;
    const output = isPlainRecord(rawPricing) ? getOwnProperty(rawPricing, 'output') : undefined;
    const pricing =
      typeof input === 'number' &&
      Number.isFinite(input) &&
      input >= 0 &&
      typeof output === 'number' &&
      Number.isFinite(output) &&
      output >= 0
        ? { input, output }
        : undefined;
    models.push({
      ...(pricing ? { pricing } : {}),
      id,
      name,
      provider: deriveProvider(id),
    });
  }

  try {
    validateModels(models);
  } catch {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  return models;
}

function parseGenerateResponse(parsed: unknown): { text: string; usage?: GenerateUsage } {
  if (!isPlainRecord(parsed)) {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  const text = getOwnProperty(parsed, 'text');
  if (typeof text !== 'string') {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  const rawUsage = getOwnProperty(parsed, 'usage');
  const inputTokens = isPlainRecord(rawUsage) ? getOwnProperty(rawUsage, 'inputTokens') : undefined;
  const outputTokens = isPlainRecord(rawUsage)
    ? getOwnProperty(rawUsage, 'outputTokens')
    : undefined;
  const usage =
    typeof inputTokens === 'number' &&
    Number.isSafeInteger(inputTokens) &&
    inputTokens >= 0 &&
    typeof outputTokens === 'number' &&
    Number.isSafeInteger(outputTokens) &&
    outputTokens >= 0
      ? { inputTokens, outputTokens }
      : undefined;
  return { text, ...(usage ? { usage } : {}) };
}

export function createAiProxyClient(
  config: Pick<AppConfig, 'llmBaseUrl' | 'llmApiKey' | 'llmTimeoutMs'>,
): {
  listModels(): Promise<Model[]>;
  generate: Generate;
  streamGenerate: StreamGenerate;
} {
  const baseUrl = config.llmBaseUrl.replace(/\/+$/, '');
  const apiKey = config.llmApiKey;
  const timeoutMs = config.llmTimeoutMs;

  async function streamGenerate(
    input: GenerateInput,
    options: StreamOptions,
  ): Promise<StreamResult> {
    if (options.signal.aborted) {
      throw new DOMException('This operation was aborted', 'AbortError');
    }

    const effectiveController = new AbortController();
    let timedOut = false;
    let abortedByExternal = false;
    let callbackError: unknown = null;

    const onExternalAbort = () => {
      if (timedOut) return;
      abortedByExternal = true;
      effectiveController.abort(options.signal.reason);
    };
    options.signal.addEventListener('abort', onExternalAbort, { once: true });

    const timer = setTimeout(() => {
      if (abortedByExternal) return;
      timedOut = true;
      effectiveController.abort();
    }, timeoutMs);

    const startedAt = performance.now();
    let responseBody: ReadableStream<Uint8Array> | null = null;

    function checkCancellation(): void {
      if (abortedByExternal) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      if (timedOut || performance.now() - startedAt > timeoutMs) {
        timedOut = true;
        effectiveController.abort();
        throw new AiProxyError('UPSTREAM_TIMEOUT');
      }
    }

    try {
      const headers: Record<string, string> = {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/x-ndjson',
      };

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/stream`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ prompt: input.prompt, model: input.modelId }),
          redirect: 'error',
          signal: effectiveController.signal,
        });
      } catch {
        if (timedOut) {
          throw new AiProxyError('UPSTREAM_TIMEOUT');
        }
        if (abortedByExternal || options.signal.aborted) {
          throw new DOMException('This operation was aborted', 'AbortError');
        }
        throw new AiProxyError('UPSTREAM_ERROR');
      }

      if (response.status !== 200) {
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // best-effort cancel
          }
        }
        if (timedOut) {
          throw new AiProxyError('UPSTREAM_TIMEOUT');
        }
        if (abortedByExternal || options.signal.aborted) {
          throw new DOMException('This operation was aborted', 'AbortError');
        }
        if (response.status === 401 || response.status === 403) {
          throw new AiProxyError('UPSTREAM_AUTH_ERROR');
        }
        if (response.status === 429) {
          throw new AiProxyError('UPSTREAM_LIMIT_EXCEEDED');
        }
        throw new AiProxyError('UPSTREAM_ERROR');
      }

      if (!response.body) {
        throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
      }
      responseBody = response.body;

      const rawContentType = response.headers.get('content-type') ?? '';
      const mediaType = rawContentType.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/x-ndjson') {
        try {
          await response.body.cancel();
        } catch {
          // best-effort cancel
        }
        throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
      }

      checkCancellation();
      try {
        await options.onReady(effectiveController.signal);
      } catch (err: unknown) {
        callbackError = err;
        throw err;
      }
      checkCancellation();

      let finished = false;
      let streamUsage: GenerateUsage | undefined;
      let durationMs = 0;

      const chunks = response.body as unknown as AsyncIterable<Uint8Array>;

      for await (const rawItem of parseNdjson(chunks)) {
        checkCancellation();

        if (!isPlainRecord(rawItem)) {
          throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
        }

        const type = getOwnProperty(rawItem, 'type');
        if (typeof type !== 'string') {
          throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
        }

        if (
          type === 'start' ||
          type === 'text-start' ||
          type === 'text-end' ||
          type === 'reasoning-start' ||
          type === 'reasoning-end'
        ) {
          continue;
        }

        if (type === 'text-delta' || type === 'reasoning-delta') {
          const delta = getOwnProperty(rawItem, 'delta');
          if (typeof delta !== 'string') {
            throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
          }
          if (delta.length === 0) {
            continue;
          }
          try {
            await options.onDelta({ type, delta }, effectiveController.signal);
          } catch (err: unknown) {
            callbackError = err;
            throw err;
          }
          checkCancellation();
          continue;
        }

        if (type === 'finish') {
          const rawUsage = getOwnProperty(rawItem, 'usage');
          const inputTokens = isPlainRecord(rawUsage)
            ? getOwnProperty(rawUsage, 'inputTokens')
            : undefined;
          const outputTokens = isPlainRecord(rawUsage)
            ? getOwnProperty(rawUsage, 'outputTokens')
            : undefined;
          if (
            typeof inputTokens === 'number' &&
            Number.isSafeInteger(inputTokens) &&
            inputTokens >= 0 &&
            typeof outputTokens === 'number' &&
            Number.isSafeInteger(outputTokens) &&
            outputTokens >= 0
          ) {
            streamUsage = { inputTokens, outputTokens };
          }

          durationMs = Math.max(0, performance.now() - startedAt);
          if (timedOut || durationMs > timeoutMs) {
            throw new AiProxyError('UPSTREAM_TIMEOUT');
          }

          finished = true;
          try {
            await response.body.cancel();
          } catch {
            // best-effort cancel
          }
          break;
        }

        if (type === 'error') {
          throw new AiProxyError('UPSTREAM_ERROR');
        }

        // unknown string type: ignore
      }

      if (!finished) {
        throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
      }

      checkCancellation();
      return {
        durationMs,
        ...(streamUsage ? { usage: streamUsage } : {}),
      };
    } catch (err: unknown) {
      if (responseBody) {
        try {
          await responseBody.cancel();
        } catch {
          // best-effort cancel
        }
      }
      if (abortedByExternal) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      if (timedOut) {
        throw new AiProxyError('UPSTREAM_TIMEOUT');
      }
      if (callbackError !== null && err === callbackError) {
        throw err;
      }
      if (err instanceof AiProxyError) {
        throw err;
      }
      if (err instanceof NdjsonParseError) {
        throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
      }
      if (timedOut) {
        throw new AiProxyError('UPSTREAM_TIMEOUT');
      }
      if (abortedByExternal || options.signal.aborted) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      throw new AiProxyError('UPSTREAM_ERROR');
    } finally {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  async function requestJsonWithDeadline<T>(
    path: '/models' | '/generate',
    requestOptions: { method: 'GET' } | { method: 'POST'; body: string },
    parsePayload: (parsed: unknown) => T,
  ): Promise<{ value: T; durationMs: number }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const startedAt = performance.now();
    try {
      const headers: Record<string, string> = {
        'x-api-key': apiKey,
      };
      if (requestOptions.method === 'POST') {
        headers['content-type'] = 'application/json';
      }

      const response = await fetch(`${baseUrl}${path}`, {
        method: requestOptions.method,
        headers,
        ...(requestOptions.method === 'POST' ? { body: requestOptions.body } : {}),
        redirect: 'error',
        signal: controller.signal,
      });

      if (response.status !== 200) {
        if (response.body) {
          try {
            await response.body.cancel();
          } catch {
            // Best-effort cancellation; preserve status classification.
          }
        }
        if (response.status === 401 || response.status === 403) {
          throw new AiProxyError('UPSTREAM_AUTH_ERROR');
        }
        if (response.status === 429) {
          throw new AiProxyError('UPSTREAM_LIMIT_EXCEEDED');
        }
        throw new AiProxyError('UPSTREAM_ERROR');
      }

      const rawText = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText) as unknown;
      } catch {
        throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
      }

      const value = parsePayload(parsed);
      const durationMs = Math.max(0, performance.now() - startedAt);
      if (timedOut || durationMs > timeoutMs) {
        throw new AiProxyError('UPSTREAM_TIMEOUT');
      }

      return { value, durationMs };
    } catch (err: unknown) {
      if (err instanceof AiProxyError) {
        throw err;
      }
      if (timedOut) {
        throw new AiProxyError('UPSTREAM_TIMEOUT');
      }
      throw new AiProxyError('UPSTREAM_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async listModels(): Promise<Model[]> {
      const { value } = await requestJsonWithDeadline('/models', { method: 'GET' }, parseCatalog);
      return value;
    },
    async generate(input: GenerateInput): Promise<GenerateResult> {
      const { value, durationMs } = await requestJsonWithDeadline(
        '/generate',
        {
          method: 'POST',
          body: JSON.stringify({ prompt: input.prompt, model: input.modelId }),
        },
        parseGenerateResponse,
      );
      return { ...value, durationMs };
    },
    streamGenerate,
  };
}
