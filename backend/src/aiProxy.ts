import type { AppConfig } from './config.js';
import { validateModels, type Model } from './models.js';

export interface GenerateInput {
  prompt: string;
  modelId: string;
}

export interface GenerateResult {
  text: string;
  durationMs: number;
}

export type Generate = (input: GenerateInput) => Promise<GenerateResult>;

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
    models.push({
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

function parseGenerateResponse(parsed: unknown): string {
  if (!isPlainRecord(parsed)) {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  const text = getOwnProperty(parsed, 'text');
  if (typeof text !== 'string') {
    throw new AiProxyError('UPSTREAM_INVALID_RESPONSE');
  }

  return text;
}

export function createAiProxyClient(
  config: Pick<AppConfig, 'llmBaseUrl' | 'llmApiKey' | 'llmTimeoutMs'>,
): {
  listModels(): Promise<Model[]>;
  generate: Generate;
} {
  const baseUrl = config.llmBaseUrl.replace(/\/+$/, '');
  const apiKey = config.llmApiKey;
  const timeoutMs = config.llmTimeoutMs;

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
      return { text: value, durationMs };
    },
  };
}
