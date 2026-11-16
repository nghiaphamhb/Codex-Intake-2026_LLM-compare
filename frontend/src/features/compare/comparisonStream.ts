import {
  ComparisonApiError,
  handleHttpError,
  type ComparisonApiErrorCode,
} from './comparisonApi.js';
import { parseStreamNdjson, StreamNdjsonError } from './streamNdjson.js';

export type ComparisonStreamDelta =
  { type: 'text-delta'; delta: string } | { type: 'reasoning-delta'; delta: string };

export type ComparisonStreamResult = {
  durationMs: number;
  costUsd: number | null;
};

const UPSTREAM_CODES = new Set<ComparisonApiErrorCode>([
  'INVALID_REQUEST',
  'GENERATION_UNAVAILABLE',
  'UPSTREAM_AUTH_ERROR',
  'UPSTREAM_LIMIT_EXCEEDED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'UPSTREAM_INVALID_RESPONSE',
  'NETWORK_ERROR',
  'INVALID_RESPONSE',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function streamAnswer(
  input: { prompt: string; modelId: string },
  signal: AbortSignal,
  onDelta: (event: ComparisonStreamDelta) => void,
): Promise<ComparisonStreamResult> {
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  let response: Response;
  try {
    response = await fetch('/api/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
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

  const contentType = response.headers.get('Content-Type') || '';
  const mediaType = contentType.split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/x-ndjson') {
    await response.body?.cancel().catch(() => {});
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  if (!response.body) {
    throw new ComparisonApiError('INVALID_RESPONSE');
  }

  const reader = response.body.getReader();

  async function* readerChunks(): AsyncGenerator<Uint8Array> {
    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (readErr: unknown) {
          if (
            signal.aborted ||
            (readErr instanceof DOMException && readErr.name === 'AbortError')
          ) {
            throw readErr;
          }
          throw new ComparisonApiError('NETWORK_ERROR');
        }

        if (chunk.done) {
          break;
        }
        if (chunk.value) {
          yield chunk.value;
        }
      }
    } finally {
      // Cleanup happens in the outer finally
    }
  }

  let hasStarted = false;
  let callbackFailed = false;

  try {
    for await (const raw of parseStreamNdjson(readerChunks())) {
      if (signal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      if (!isPlainRecord(raw) || typeof raw.type !== 'string') {
        throw new ComparisonApiError('INVALID_RESPONSE');
      }

      const eventType = raw.type;

      if (eventType === 'start') {
        if (hasStarted) {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }
        if (typeof raw.modelId !== 'string' || raw.modelId !== input.modelId) {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }
        hasStarted = true;
        continue;
      }

      if (eventType === 'error') {
        // error event can arrive before or after start
        if (!isPlainRecord(raw.error)) {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }
        const code = raw.error.code;
        const message = raw.error.message;
        if (typeof code !== 'string' || code === '' || typeof message !== 'string') {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }

        await reader.cancel().catch(() => {});

        let finalCode: ComparisonApiErrorCode = 'UPSTREAM_ERROR';
        if (UPSTREAM_CODES.has(code as ComparisonApiErrorCode)) {
          finalCode = code as ComparisonApiErrorCode;
        }
        throw new ComparisonApiError(finalCode);
      }

      if (!hasStarted) {
        throw new ComparisonApiError('INVALID_RESPONSE');
      }

      if (eventType === 'text-delta' || eventType === 'reasoning-delta') {
        if (typeof raw.delta !== 'string') {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }
        if (raw.delta.length === 0) {
          continue;
        }
        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        try {
          onDelta({ type: eventType, delta: raw.delta });
        } catch (err: unknown) {
          callbackFailed = true;
          throw err;
        }
        continue;
      }

      if (eventType === 'done') {
        const durationMs = raw.durationMs;
        if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }

        if (!Object.hasOwn(raw, 'costUsd')) {
          throw new ComparisonApiError('INVALID_RESPONSE');
        }

        const costUsd = raw.costUsd;
        if (costUsd !== null) {
          if (typeof costUsd !== 'number' || !Number.isFinite(costUsd) || costUsd < 0) {
            throw new ComparisonApiError('INVALID_RESPONSE');
          }
        }

        await reader.cancel().catch(() => {});

        if (signal.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }

        return {
          durationMs,
          costUsd,
        };
      }

      // Any other unknown type
      throw new ComparisonApiError('INVALID_RESPONSE');
    }

    // EOF reached without terminal event
    throw new ComparisonApiError('INVALID_RESPONSE');
  } catch (err: unknown) {
    await reader.cancel().catch(() => {});
    if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    if (callbackFailed) throw err;
    if (err instanceof ComparisonApiError) {
      throw err;
    }
    if (err instanceof StreamNdjsonError) {
      throw new ComparisonApiError('INVALID_RESPONSE');
    }
    if (err instanceof TypeError) {
      throw new ComparisonApiError('NETWORK_ERROR');
    }
    throw new ComparisonApiError('INVALID_RESPONSE');
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
