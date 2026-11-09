import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { readConfig } from './config.js';

async function start() {
  let app: FastifyInstance | undefined;
  try {
    if (existsSync('.env')) {
      try {
        loadEnvFile('.env');
      } catch {
        throw new Error('Unable to load environment configuration');
      }
    }

    const config = readConfig(process.env);
    app = buildApp({ logger: true });
    await app.listen({ port: config.port, host: '127.0.0.1' });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith('Invalid configuration:')) {
      console.error(err.message);
    } else if (err instanceof Error && err.message === 'Unable to load environment configuration') {
      console.error('Unable to load environment configuration');
    } else if (app) {
      app.log.error(err, 'Failed to start server');
    } else {
      console.error('Failed to start server');
    }

    if (app) {
      try {
        await app.close();
      } catch {
        // ignore close error
      }
    }
    process.exitCode = 1;
  }
}

start();
