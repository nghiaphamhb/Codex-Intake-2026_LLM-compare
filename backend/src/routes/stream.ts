import type { FastifyInstance } from 'fastify';
import { estimateCostUsd } from '../cost.js';
import {
  AiProxyError,
  type AiProxyErrorCode,
  type StreamDelta,
  type StreamGenerate,
} from '../aiProxy.js';
import type { Model } from '../models.js';

interface StreamBody {
  prompt: string;
  modelId: string;
}

export type PublicStreamEvent =
  | { type: 'start'; modelId: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'done'; durationMs: number; costUsd: number | null }
  | { type: 'error'; error: { code: AiProxyErrorCode | 'INTERNAL_ERROR'; message: string } };

const bodySchema = {
  type: 'object',
  required: ['prompt', 'modelId'],
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 10000 },
    modelId: { type: 'string', minLength: 1 },
  },
} as const;

export async function writeNdjsonEvent(
  raw: {
    write: (chunk: string, encoding: BufferEncoding) => boolean;
    writableEnded?: boolean;
    destroyed?: boolean;
    on: (event: string, listener: () => void) => unknown;
    off: (event: string, listener: () => void) => unknown;
  },
  event: PublicStreamEvent,
  effectiveSignal: AbortSignal,
): Promise<void> {
  if (raw.writableEnded || raw.destroyed || effectiveSignal.aborted) {
    return;
  }

  const line = JSON.stringify(event) + '\n';
  const canContinue = raw.write(line, 'utf-8');
  if (canContinue) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      raw.off('drain', onDrain);
      raw.off('close', onClose);
      raw.off('error', onError);
      effectiveSignal.removeEventListener('abort', onAbort);
      resolve();
    };

    const onDrain = () => cleanup();
    const onClose = () => cleanup();
    const onError = () => cleanup();
    const onAbort = () => cleanup();

    if (effectiveSignal.aborted || raw.destroyed || raw.writableEnded) {
      cleanup();
      return;
    }

    raw.on('drain', onDrain);
    raw.on('close', onClose);
    raw.on('error', onError);
    effectiveSignal.addEventListener('abort', onAbort, { once: true });
  });
}

export function safeWriteTerminalEvent(
  raw: {
    write: (chunk: string, encoding: BufferEncoding) => boolean;
    end: () => unknown;
    destroy: () => unknown;
    writable?: boolean;
    writableEnded?: boolean;
    destroyed?: boolean;
  },
  event: PublicStreamEvent,
  state: { terminalSent: boolean },
): void {
  if (state.terminalSent) {
    return;
  }
  state.terminalSent = true;
  if (raw.writable && !raw.writableEnded && !raw.destroyed) {
    try {
      raw.write(JSON.stringify(event) + '\n', 'utf-8');
      raw.end();
    } catch {
      // A failed terminal write must still close the hijacked response.
      try {
        raw.destroy();
      } catch {
        // best-effort
      }
    }
  } else {
    try {
      raw.destroy();
    } catch {
      // best-effort
    }
  }
}

export function registerStreamRoutes(
  app: FastifyInstance,
  models: readonly Model[],
  streamGenerate?: StreamGenerate,
): void {
  app.post<{ Body: StreamBody }>(
    '/api/stream',
    {
      schema: {
        body: bodySchema,
      },
    },
    async (request, reply) => {
      if (request.body.prompt.trim().length === 0) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Prompt must not be blank',
          },
        });
      }

      const selectedModel = models.find((model) => model.id === request.body.modelId);
      if (!selectedModel) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Unknown modelId',
          },
        });
      }

      if (!streamGenerate) {
        return reply.code(503).send({
          error: {
            code: 'GENERATION_UNAVAILABLE',
            message: 'Text generation is not configured',
          },
        });
      }

      const controller = new AbortController();

      const onResponseClose = () => {
        if (!reply.raw.writableFinished) {
          controller.abort();
        }
      };
      reply.raw.on('close', onResponseClose);

      let hijacked = false;
      const terminalState = { terminalSent: false };

      const onReady = async (effectiveSignal: AbortSignal): Promise<void> => {
        if (reply.raw.destroyed || reply.raw.writableEnded || controller.signal.aborted) {
          return;
        }
        reply.hijack();
        hijacked = true;

        reply.raw.writeHead(200, {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          'x-accel-buffering': 'no',
        });
        reply.raw.flushHeaders?.();

        await writeNdjsonEvent(
          reply.raw,
          { type: 'start', modelId: request.body.modelId },
          effectiveSignal,
        );
      };

      const onDelta = async (delta: StreamDelta, effectiveSignal: AbortSignal): Promise<void> => {
        await writeNdjsonEvent(reply.raw, delta, effectiveSignal);
      };

      try {
        const result = await streamGenerate(
          { prompt: request.body.prompt, modelId: request.body.modelId },
          {
            signal: controller.signal,
            onReady,
            onDelta,
          },
        );

        const costUsd = estimateCostUsd(selectedModel.pricing, result.usage);
        safeWriteTerminalEvent(
          reply.raw,
          {
            type: 'done',
            durationMs: result.durationMs,
            costUsd,
          },
          terminalState,
        );
      } catch (err: unknown) {
        if (controller.signal.aborted) {
          if (hijacked) {
            try {
              reply.raw.destroy();
            } catch {
              // best effort
            }
          }
          return;
        }

        if (!hijacked) {
          if (err instanceof AiProxyError) {
            return reply.code(err.statusCode).send({
              error: {
                code: err.code,
                message: err.message,
              },
            });
          }
          return reply.code(500).send({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Internal server error',
            },
          });
        }

        if (err instanceof AiProxyError) {
          safeWriteTerminalEvent(
            reply.raw,
            {
              type: 'error',
              error: {
                code: err.code,
                message: err.message,
              },
            },
            terminalState,
          );
        } else {
          safeWriteTerminalEvent(
            reply.raw,
            {
              type: 'error',
              error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error',
              },
            },
            terminalState,
          );
        }
      } finally {
        reply.raw.off('close', onResponseClose);
      }
    },
  );
}
