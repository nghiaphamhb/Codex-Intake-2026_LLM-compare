import type { FastifyInstance } from 'fastify';
import type { Model } from '../models.js';

export function registerModelRoutes(
  app: FastifyInstance,
  models: readonly Model[]
): void {
  app.get(
    '/api/models',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            required: ['models'],
            additionalProperties: false,
            properties: {
              models: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'name', 'provider'],
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    provider: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    async () => {
      return { models };
    }
  );
}

