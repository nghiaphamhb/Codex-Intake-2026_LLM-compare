import type { FastifyInstance } from 'fastify';
import { AiProxyError, type Generate } from '../aiProxy.js';
import type { Model } from '../models.js';

interface GenerateBody {
  prompt: string;
  modelId: string;
}

const bodySchema = {
  type: 'object',
  required: ['prompt', 'modelId'],
  additionalProperties: false,
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 10000 },
    modelId: { type: 'string', minLength: 1 },
  },
} as const;

const response200Schema = {
  type: 'object',
  required: ['modelId', 'text', 'durationMs'],
  additionalProperties: false,
  properties: {
    modelId: { type: 'string' },
    text: { type: 'string' },
    durationMs: { type: 'number', minimum: 0 },
  },
} as const;

export function registerGenerateRoutes(
  app: FastifyInstance,
  models: readonly Model[],
  generate?: Generate,
): void {
  app.post<{ Body: GenerateBody }>(
    '/api/generate',
    {
      schema: {
        body: bodySchema,
        response: {
          200: response200Schema,
        },
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

      if (!models.some((model) => model.id === request.body.modelId)) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Unknown modelId',
          },
        });
      }

      if (!generate) {
        return reply.code(503).send({
          error: {
            code: 'GENERATION_UNAVAILABLE',
            message: 'Text generation is not configured',
          },
        });
      }

      try {
        const result = await generate({
          prompt: request.body.prompt,
          modelId: request.body.modelId,
        });
        return reply.code(200).send({
          modelId: request.body.modelId,
          text: result.text,
          durationMs: result.durationMs,
        });
      } catch (err: unknown) {
        if (err instanceof AiProxyError) {
          return reply.code(err.statusCode).send({
            error: {
              code: err.code,
              message: err.message,
            },
          });
        }
        throw err;
      }
    },
  );
}
