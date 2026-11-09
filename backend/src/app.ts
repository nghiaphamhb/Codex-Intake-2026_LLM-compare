import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { configuredModels, validateModels, type Model } from './models.js';
import { registerModelRoutes } from './routes/models.js';

export interface BuildAppOptions {
  logger?: boolean;
  models?: readonly Model[];
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const modelsInput = options.models ?? configuredModels;
  validateModels(modelsInput);
  const modelsSnapshot: Model[] = modelsInput.map(({ id, name, provider }) => ({
    id,
    name,
    provider
  }));

  const app = Fastify({
    logger: options.logger ?? false
  });

  app.get('/api/health', async () => {
    return { status: 'ok' };
  });

  registerModelRoutes(app, modelsSnapshot);

  return app;
}
