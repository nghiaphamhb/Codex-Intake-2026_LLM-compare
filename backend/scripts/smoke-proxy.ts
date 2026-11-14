import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import type { FastifyInstance } from 'fastify';
import { AiProxyError, type AiProxyErrorCode, createAiProxyClient } from '../src/aiProxy.js';
import { buildApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
import type { Model } from '../src/models.js';

type SmokeErrorCode =
  | 'SMOKE_INVALID_ARGS'
  | 'SMOKE_ENV_LOAD_FAILED'
  | 'SMOKE_CONFIG_INVALID'
  | 'SMOKE_EMPTY_CATALOG'
  | 'SMOKE_MODEL_NOT_FOUND'
  | 'SMOKE_API_CONTRACT_FAILED'
  | 'SMOKE_EMPTY_TEXT'
  | 'SMOKE_FAILED'
  | AiProxyErrorCode;

const VALID_UPSTREAM_CODES = new Set<AiProxyErrorCode>([
  'UPSTREAM_AUTH_ERROR',
  'UPSTREAM_LIMIT_EXCEEDED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_ERROR',
  'UPSTREAM_INVALID_RESPONSE',
]);

interface ParsedArgs {
  mode: 'catalog' | 'generate';
  modelId?: string;
}

function parseCliArgs(args: string[]): ParsedArgs {
  if (args.length === 0) {
    return { mode: 'catalog' };
  }

  if (args.length === 3 && args[0] === '--generate' && args[1] === '--model') {
    const modelId = args[2];
    if (modelId === '' || modelId.trim() !== modelId) {
      throw new Error('SMOKE_INVALID_ARGS');
    }
    return { mode: 'generate', modelId };
  }

  throw new Error('SMOKE_INVALID_ARGS');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}

function parseUpstreamCode(code: unknown): AiProxyErrorCode | null {
  if (typeof code === 'string' && VALID_UPSTREAM_CODES.has(code as AiProxyErrorCode)) {
    return code as AiProxyErrorCode;
  }
  return null;
}

async function run(): Promise<void> {
  let parsedArgs: ParsedArgs;
  try {
    parsedArgs = parseCliArgs(process.argv.slice(2));
  } catch {
    process.stderr.write(JSON.stringify({ ok: false, code: 'SMOKE_INVALID_ARGS' }) + '\n');
    process.exitCode = 1;
    return;
  }

  const envPath = new URL('../../.env', import.meta.url);
  if (existsSync(envPath)) {
    try {
      loadEnvFile(envPath);
    } catch {
      process.stderr.write(JSON.stringify({ ok: false, code: 'SMOKE_ENV_LOAD_FAILED' }) + '\n');
      process.exitCode = 1;
      return;
    }
  }

  let config;
  try {
    config = readConfig(process.env);
  } catch {
    process.stderr.write(JSON.stringify({ ok: false, code: 'SMOKE_CONFIG_INVALID' }) + '\n');
    process.exitCode = 1;
    return;
  }

  let app: FastifyInstance | undefined;
  let failureCode: SmokeErrorCode | null = null;
  let successOutput: string | null = null;

  try {
    const client = createAiProxyClient(config);
    let models: Model[];
    try {
      models = await client.listModels();
    } catch (err: unknown) {
      if (err instanceof AiProxyError) {
        failureCode = err.code;
      } else {
        failureCode = 'SMOKE_FAILED';
      }
      return;
    }

    if (models.length === 0) {
      failureCode = 'SMOKE_EMPTY_CATALOG';
      return;
    }

    if (parsedArgs.mode === 'generate') {
      const targetModelId = parsedArgs.modelId;
      const modelExists = models.some((m) => m.id === targetModelId);
      if (!modelExists) {
        failureCode = 'SMOKE_MODEL_NOT_FOUND';
        return;
      }
    }

    app = buildApp({ logger: false, models, generate: client.generate });

    const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
    if (healthRes.statusCode !== 200) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }
    let healthJson: unknown;
    try {
      healthJson = JSON.parse(healthRes.body);
    } catch {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }
    if (
      !isPlainRecord(healthJson) ||
      !hasExactKeys(healthJson, ['status']) ||
      healthJson.status !== 'ok'
    ) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }

    const modelsRes = await app.inject({ method: 'GET', url: '/api/models' });
    if (modelsRes.statusCode !== 200) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }
    let modelsJson: unknown;
    try {
      modelsJson = JSON.parse(modelsRes.body);
    } catch {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }
    if (
      !isPlainRecord(modelsJson) ||
      !hasExactKeys(modelsJson, ['models']) ||
      !Array.isArray(modelsJson.models)
    ) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }
    if (modelsJson.models.length !== models.length) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }
    for (let i = 0; i < models.length; i++) {
      const item = modelsJson.models[i];
      const expected = models[i];
      if (
        !isPlainRecord(item) ||
        !hasExactKeys(item, ['id', 'name', 'provider']) ||
        item.id !== expected.id ||
        item.name !== expected.name ||
        item.provider !== expected.provider
      ) {
        failureCode = 'SMOKE_API_CONTRACT_FAILED';
        return;
      }
    }

    if (parsedArgs.mode === 'catalog') {
      successOutput = JSON.stringify({
        ok: true,
        mode: 'catalog',
        modelCount: models.length,
        health: 'ok',
      });
      return;
    }

    const targetModelId = parsedArgs.modelId!;
    const genRes = await app.inject({
      method: 'POST',
      url: '/api/generate',
      headers: { 'content-type': 'application/json' },
      payload: {
        prompt: 'Reply with only: OK',
        modelId: targetModelId,
      },
    });

    if (genRes.statusCode !== 200) {
      let errJson: unknown;
      try {
        errJson = JSON.parse(genRes.body);
      } catch {
        failureCode = 'SMOKE_FAILED';
        return;
      }

      if (
        isPlainRecord(errJson) &&
        isPlainRecord(errJson.error) &&
        parseUpstreamCode(errJson.error.code) !== null
      ) {
        failureCode = parseUpstreamCode(errJson.error.code)!;
        return;
      }

      failureCode = 'SMOKE_FAILED';
      return;
    }

    let genJson: unknown;
    try {
      genJson = JSON.parse(genRes.body);
    } catch {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }

    if (!isPlainRecord(genJson) || !hasExactKeys(genJson, ['modelId', 'text', 'durationMs'])) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }

    const { modelId, text, durationMs } = genJson;
    if (
      typeof modelId !== 'string' ||
      modelId !== targetModelId ||
      typeof text !== 'string' ||
      typeof durationMs !== 'number' ||
      !Number.isFinite(durationMs) ||
      durationMs < 0
    ) {
      failureCode = 'SMOKE_API_CONTRACT_FAILED';
      return;
    }

    if (text.trim() === '') {
      failureCode = 'SMOKE_EMPTY_TEXT';
      return;
    }

    successOutput = JSON.stringify({
      ok: true,
      mode: 'generate',
      modelCount: models.length,
      health: 'ok',
      modelId: targetModelId,
      durationMs,
      textNonEmpty: true,
    });
  } catch {
    failureCode = 'SMOKE_FAILED';
  } finally {
    if (app) {
      try {
        await app.close();
      } catch {
        failureCode = 'SMOKE_FAILED';
        successOutput = null;
      }
    }

    if (failureCode !== null) {
      process.stderr.write(JSON.stringify({ ok: false, code: failureCode }) + '\n');
      process.exitCode = 1;
    } else if (successOutput !== null) {
      process.stdout.write(successOutput + '\n');
      process.exitCode = 0;
    }
  }
}

void run();
