import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { configuredModels, validateModels, type Model } from './models.js';
import { registerModelRoutes } from './routes/models.js';
import { registerGenerateRoutes } from './routes/generate.js';
import type { Generate } from './aiProxy.js';

export interface BuildAppOptions {
  logger?: boolean;
  models?: readonly Model[];
  generate?: Generate;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const modelsInput = options.models ?? configuredModels;
  validateModels(modelsInput);
  const modelsSnapshot: Model[] = modelsInput.map(({ id, name, provider }) => ({
    id,
    name,
    provider,
  }));

  const app = Fastify({
    logger: options.logger ?? false,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    const errorRecord = typeof error === 'object' && error !== null ? error : null;
    const errorCode =
      errorRecord !== null && 'code' in errorRecord && typeof errorRecord.code === 'string'
        ? errorRecord.code
        : undefined;
    const statusCode =
      errorRecord !== null &&
      'statusCode' in errorRecord &&
      typeof errorRecord.statusCode === 'number'
        ? errorRecord.statusCode
        : undefined;
    const hasValidation =
      errorRecord !== null && 'validation' in errorRecord && Array.isArray(errorRecord.validation);

    if (
      hasValidation ||
      errorCode === 'FST_ERR_CTP_INVALID_JSON_BODY' ||
      errorCode === 'FST_ERR_CTP_EMPTY_JSON_BODY'
    ) {
      reply.code(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request body',
        },
      });
      return;
    }

    if (errorCode === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      reply.code(415).send({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Content-Type must be application/json',
        },
      });
      return;
    }

    if (errorCode === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request body is too large',
        },
      });
      return;
    }

    if (
      statusCode !== undefined &&
      Number.isInteger(statusCode) &&
      statusCode >= 400 &&
      statusCode <= 499
    ) {
      reply.code(statusCode).send({
        error: {
          code: 'REQUEST_ERROR',
          message: 'Request could not be processed',
        },
      });
      return;
    }

    reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  app.get('/api/health', async () => {
    return { status: 'ok' };
  });

  registerModelRoutes(app, modelsSnapshot);
  registerGenerateRoutes(app, modelsSnapshot, options.generate);

  return app;
}
