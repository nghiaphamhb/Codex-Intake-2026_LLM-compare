import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import {
  AiProxyError,
  type AiProxyErrorCode,
  type Generate,
  type GenerateInput,
} from '../src/aiProxy.js';
import type { Model } from '../src/models.js';

const testModels: readonly Model[] = [{ id: 'test/model-a', name: 'Model A', provider: 'Test' }];

const INVALID_BODY_ENVELOPE = {
  error: {
    code: 'INVALID_REQUEST',
    message: 'Invalid request body',
  },
};

const BLANK_PROMPT_ENVELOPE = {
  error: {
    code: 'INVALID_REQUEST',
    message: 'Prompt must not be blank',
  },
};

const UNKNOWN_MODEL_ENVELOPE = {
  error: {
    code: 'INVALID_REQUEST',
    message: 'Unknown modelId',
  },
};

const GENERATION_UNAVAILABLE_ENVELOPE = {
  error: {
    code: 'GENERATION_UNAVAILABLE',
    message: 'Text generation is not configured',
  },
};

function createGenerateSpy(
  impl: Generate = async () => ({ text: '  Markdown\n', durationMs: 12.5 }),
) {
  const calls: GenerateInput[] = [];
  const generate: Generate = async (input) => {
    calls.push(input);
    return impl(input);
  };
  return { calls, generate };
}

test('POST /api/generate rejects invalid body shapes and parser errors with 400 envelope without calling generate', async (t) => {
  const cases: ReadonlyArray<{
    name: string;
    headers?: Record<string, string>;
    payload?: string | Record<string, unknown>;
  }> = [
    { name: 'missing body' },
    {
      name: 'JSON null body',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(null),
    },
    {
      name: 'JSON array body',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify([]),
    },
    {
      name: 'JSON string body',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify('hello'),
    },
    {
      name: 'JSON number body',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(42),
    },
    {
      name: 'JSON boolean body',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(true),
    },
    {
      name: 'empty JSON body',
      headers: { 'content-type': 'application/json' },
      payload: '',
    },
    {
      name: 'malformed JSON body',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    },
    {
      name: 'missing prompt',
      payload: { modelId: 'test/model-a' },
    },
    {
      name: 'missing modelId',
      payload: { prompt: 'Hello' },
    },
    {
      name: 'empty prompt string',
      payload: { prompt: '', modelId: 'test/model-a' },
    },
    {
      name: 'empty modelId string',
      payload: { prompt: 'Hello', modelId: '' },
    },
    {
      name: 'extra property',
      payload: { prompt: 'PROMPT_SENTINEL_DO_NOT_ECHO', modelId: 'test/model-a', extra: 'x' },
    },
    {
      name: 'alias model field rejected as additional property',
      payload: { prompt: 'Hello', modelId: 'test/model-a', model: 'test/model-a' },
    },
    {
      name: 'extra url and key fields rejected as additional properties',
      payload: {
        prompt: 'Hello',
        modelId: 'test/model-a',
        url: 'https://example.invalid',
        apiKey: 'test-secret-do-not-log',
      },
    },
    {
      name: 'non-string prompt: number',
      payload: { prompt: 123, modelId: 'test/model-a' },
    },
    {
      name: 'non-string prompt: boolean',
      payload: { prompt: true, modelId: 'test/model-a' },
    },
    {
      name: 'non-string prompt: object',
      payload: { prompt: {}, modelId: 'test/model-a' },
    },
    {
      name: 'non-string prompt: array',
      payload: { prompt: ['Hello'], modelId: 'test/model-a' },
    },
    {
      name: 'non-string prompt: null',
      payload: { prompt: null, modelId: 'test/model-a' },
    },
    {
      name: 'non-string modelId: number',
      payload: { prompt: 'Hello', modelId: 123 },
    },
    {
      name: 'non-string modelId: boolean',
      payload: { prompt: 'Hello', modelId: false },
    },
    {
      name: 'non-string modelId: object',
      payload: { prompt: 'Hello', modelId: {} },
    },
    {
      name: 'non-string modelId: array',
      payload: { prompt: 'Hello', modelId: ['test/model-a'] },
    },
    {
      name: 'non-string modelId: null',
      payload: { prompt: 'Hello', modelId: null },
    },
  ];

  const spy = createGenerateSpy();
  const app = buildApp({ logger: false, models: testModels, generate: spy.generate });
  t.after(() => app.close());

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/generate',
        ...(testCase.headers ? { headers: testCase.headers } : {}),
        ...(testCase.payload !== undefined ? { payload: testCase.payload } : {}),
      });

      assert.equal(response.statusCode, 400);
      assert.deepEqual(response.json(), INVALID_BODY_ENVELOPE);
      assert.equal(response.body.includes('PROMPT_SENTINEL_DO_NOT_ECHO'), false);
    });
  }
  assert.equal(spy.calls.length, 0);
});

test('POST /api/generate does not accept missing body fields from query string', async (t) => {
  const spy = createGenerateSpy();
  const app = buildApp({ logger: false, models: testModels, generate: spy.generate });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/generate?prompt=Hello&modelId=test/model-a',
    payload: { modelId: 'test/model-a' },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), INVALID_BODY_ENVELOPE);
  assert.equal(spy.calls.length, 0);
});

test('POST /api/generate rejects blank prompts and enforces maxLength in Unicode code points without calling generate', async (t) => {
  const spy = createGenerateSpy();
  const app = buildApp({ logger: false, models: testModels, generate: spy.generate });
  t.after(() => app.close());

  const blankPrompts = ['   ', ' \t\n ', '\u00A0\u00A0'];
  for (const prompt of blankPrompts) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt, modelId: 'test/model-a' },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), BLANK_PROMPT_ENVELOPE);
  }

  const blankWithUnknownModel = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: ' \t\n ', modelId: 'test/unknown' },
  });
  assert.equal(blankWithUnknownModel.statusCode, 400);
  assert.deepEqual(blankWithUnknownModel.json(), BLANK_PROMPT_ENVELOPE);

  const tooLongAscii = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: {
      prompt: `PROMPT_SENTINEL_DO_NOT_ECHO${'a'.repeat(10001 - 'PROMPT_SENTINEL_DO_NOT_ECHO'.length)}`,
      modelId: 'test/model-a',
    },
  });
  assert.equal(tooLongAscii.statusCode, 400);
  assert.deepEqual(tooLongAscii.json(), INVALID_BODY_ENVELOPE);
  assert.equal(tooLongAscii.body.includes('PROMPT_SENTINEL_DO_NOT_ECHO'), false);

  const tooLongEmoji = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: '😀'.repeat(10001), modelId: 'test/model-a' },
  });
  assert.equal(tooLongEmoji.statusCode, 400);
  assert.deepEqual(tooLongEmoji.json(), INVALID_BODY_ENVELOPE);
  assert.equal(spy.calls.length, 0);
});

test('POST /api/generate forwards exact prompt and returns 200 payload for valid inputs', async (t) => {
  const validPrompts: ReadonlyArray<{ name: string; prompt: string }> = [
    { name: 'standard text', prompt: 'Hello' },
    { name: 'surrounding whitespace and newlines', prompt: '  Hello\nworld  ' },
    { name: 'Vietnamese Unicode', prompt: 'Xin chào thế giới! Hãy giải thích ngắn gọn.' },
    { name: 'Markdown table', prompt: '| Model | Score |\n| --- | --- |\n| A | 10 |' },
    { name: 'fenced code block', prompt: '```ts\nconst answer = 42;\n```' },
    { name: '9999 ASCII code points', prompt: 'a'.repeat(9999) },
    { name: '10000 ASCII code points', prompt: 'a'.repeat(10000) },
    { name: '9999 emoji code points', prompt: '😀'.repeat(9999) },
    { name: '10000 emoji code points', prompt: '😀'.repeat(10000) },
  ];

  const spy = createGenerateSpy(async () => ({
    text: '  Markdown\n',
    durationMs: 12.5,
  }));
  const app = buildApp({ logger: false, models: testModels, generate: spy.generate });
  t.after(() => app.close());

  for (const testCase of validPrompts) {
    await t.test(testCase.name, async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/generate',
        payload: { prompt: testCase.prompt, modelId: 'test/model-a' },
      });

      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), {
        modelId: 'test/model-a',
        text: '  Markdown\n',
        durationMs: 12.5,
      });
    });
  }

  assert.equal(spy.calls.length, validPrompts.length);
  assert.deepEqual(spy.calls[1], {
    prompt: '  Hello\nworld  ',
    modelId: 'test/model-a',
  });
});

test('POST /api/generate validates exact modelId against catalog without normalization or calling generate', async (t) => {
  const spy = createGenerateSpy();
  const app = buildApp({ logger: false, models: testModels, generate: spy.generate });
  t.after(() => app.close());

  const invalidIds = [
    'test/unknown',
    'Test/Model-A',
    'TEST/MODEL-A',
    ' test/model-a',
    'test/model-a ',
    ' test/model-a ',
  ];
  for (const modelId of invalidIds) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'PROMPT_SENTINEL_DO_NOT_ECHO', modelId },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), UNKNOWN_MODEL_ENVELOPE);
    assert.equal(response.body.includes('PROMPT_SENTINEL_DO_NOT_ECHO'), false);
  }
  assert.equal(spy.calls.length, 0);
});

test('POST /api/generate rejects all modelIds when catalog is empty while health and models stay 200', async (t) => {
  const spy = createGenerateSpy();
  const app = buildApp({ logger: false, models: [], generate: spy.generate });
  t.after(() => app.close());

  const healthRes = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(healthRes.statusCode, 200);
  assert.deepEqual(healthRes.json(), { status: 'ok' });

  const modelsRes = await app.inject({ method: 'GET', url: '/api/models' });
  assert.equal(modelsRes.statusCode, 200);
  assert.deepEqual(modelsRes.json(), { models: [] });

  const generateRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: 'Hello', modelId: 'test/model-a' },
  });
  assert.equal(generateRes.statusCode, 400);
  assert.deepEqual(generateRes.json(), UNKNOWN_MODEL_ENVELOPE);
  assert.equal(spy.calls.length, 0);
});

test('POST /api/generate and GET /api/models share the same immutable snapshot', async (t) => {
  const fixture: Model[] = [{ id: 'test/model-a', name: 'Model A', provider: 'Test' }];
  const spy = createGenerateSpy(async () => ({ text: 'ok', durationMs: 5 }));
  const app = buildApp({ logger: false, models: fixture, generate: spy.generate });
  t.after(() => app.close());

  fixture[0].id = 'test/model-b';
  fixture.push({ id: 'test/model-c', name: 'Model C', provider: 'Test' });

  const modelsRes = await app.inject({ method: 'GET', url: '/api/models' });
  assert.equal(modelsRes.statusCode, 200);
  assert.deepEqual(modelsRes.json(), {
    models: [{ id: 'test/model-a', name: 'Model A', provider: 'Test' }],
  });

  const validRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: 'Hello', modelId: 'test/model-a' },
  });
  assert.equal(validRes.statusCode, 200);
  assert.deepEqual(validRes.json(), { modelId: 'test/model-a', text: 'ok', durationMs: 5 });

  for (const mutatedId of ['test/model-b', 'test/model-c']) {
    const rejectedRes = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hello', modelId: mutatedId },
    });
    assert.equal(rejectedRes.statusCode, 400);
    assert.deepEqual(rejectedRes.json(), UNKNOWN_MODEL_ENVELOPE);
  }
  assert.equal(spy.calls.length, 1);
});

test('POST /api/generate handles charset, 415 unsupported media type, and 413 payload too large', async (t) => {
  const spy = createGenerateSpy(async () => ({ text: 'charset ok', durationMs: 3 }));
  const app = buildApp({ logger: false, models: testModels, generate: spy.generate });
  t.after(() => app.close());

  const charsetRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    payload: JSON.stringify({ prompt: 'Hello', modelId: 'test/model-a' }),
  });
  assert.equal(charsetRes.statusCode, 200);
  assert.deepEqual(charsetRes.json(), {
    modelId: 'test/model-a',
    text: 'charset ok',
    durationMs: 3,
  });

  const xmlRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    headers: { 'content-type': 'application/xml' },
    payload: '<request/>',
  });
  assert.equal(xmlRes.statusCode, 415);
  assert.deepEqual(xmlRes.json(), {
    error: {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Content-Type must be application/json',
    },
  });

  const oversizedRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({
      prompt: 'a'.repeat(1024 * 1024 + 1),
      modelId: 'test/model-a',
    }),
  });
  assert.equal(oversizedRes.statusCode, 413);
  assert.deepEqual(oversizedRes.json(), {
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body is too large',
    },
  });
  assert.equal(spy.calls.length, 1);
});

test('POST /api/generate returns 503 when generate dependency is omitted after validation succeeds', async (t) => {
  const app = buildApp({ logger: false, models: testModels });
  t.after(() => app.close());

  const blankRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: '   ', modelId: 'test/model-a' },
  });
  assert.equal(blankRes.statusCode, 400);
  assert.deepEqual(blankRes.json(), BLANK_PROMPT_ENVELOPE);

  const unknownRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: 'Hello', modelId: 'test/unknown' },
  });
  assert.equal(unknownRes.statusCode, 400);
  assert.deepEqual(unknownRes.json(), UNKNOWN_MODEL_ENVELOPE);

  const unavailableRes = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: 'Hello', modelId: 'test/model-a' },
  });
  assert.equal(unavailableRes.statusCode, 503);
  assert.deepEqual(unavailableRes.json(), GENERATION_UNAVAILABLE_ENVELOPE);
});

test('POST /api/generate maps every AiProxyErrorCode and sanitizes unexpected generate errors', async (t) => {
  const errorCases: ReadonlyArray<{
    code: AiProxyErrorCode;
    expectedStatus: number;
    expectedMessage: string;
  }> = [
    {
      code: 'UPSTREAM_AUTH_ERROR',
      expectedStatus: 502,
      expectedMessage: 'Model service authentication failed',
    },
    {
      code: 'UPSTREAM_LIMIT_EXCEEDED',
      expectedStatus: 429,
      expectedMessage: 'Model service limit exceeded',
    },
    {
      code: 'UPSTREAM_TIMEOUT',
      expectedStatus: 504,
      expectedMessage: 'Model service timed out',
    },
    {
      code: 'UPSTREAM_ERROR',
      expectedStatus: 502,
      expectedMessage: 'Model service request failed',
    },
    {
      code: 'UPSTREAM_INVALID_RESPONSE',
      expectedStatus: 502,
      expectedMessage: 'Model service returned an invalid response',
    },
  ];

  let nextError: Error = new Error('uninitialized');
  const app = buildApp({
    logger: false,
    models: testModels,
    generate: async () => {
      throw nextError;
    },
  });
  t.after(() => app.close());

  for (const errorCase of errorCases) {
    await t.test(errorCase.code, async () => {
      nextError = new AiProxyError(errorCase.code);
      const response = await app.inject({
        method: 'POST',
        url: '/api/generate',
        payload: { prompt: 'PROMPT_SENTINEL_DO_NOT_ECHO', modelId: 'test/model-a' },
      });

      assert.equal(response.statusCode, errorCase.expectedStatus);
      assert.deepEqual(response.json(), {
        error: {
          code: errorCase.code,
          message: errorCase.expectedMessage,
        },
      });
      assert.equal(response.body.includes('PROMPT_SENTINEL_DO_NOT_ECHO'), false);
    });
  }

  await t.test('unexpected error from generate becomes 500 generic', async () => {
    nextError = new Error('secret-upstream-failure');
    const response = await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'PROMPT_SENTINEL_DO_NOT_ECHO', modelId: 'test/model-a' },
    });

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
    assert.equal(response.body.includes('secret-upstream-failure'), false);
    assert.equal(response.body.includes('PROMPT_SENTINEL_DO_NOT_ECHO'), false);
  });
});

test('error handler sanitizes unexpected 500, framework 4xx, and framework 5xx without affecting 404', async (t) => {
  const app = buildApp({ logger: false, models: testModels });
  t.after(() => app.close());

  app.get('/__test-error-500', async () => {
    throw new Error('test-secret-do-not-log');
  });
  app.get('/__test-error-409', async () => {
    throw Object.assign(new Error('sentinel-private'), { statusCode: 409 });
  });
  app.get('/__test-error-503', async () => {
    throw Object.assign(new Error('sentinel-private'), { statusCode: 503 });
  });
  app.get('/__test-error-non-int', async () => {
    throw Object.assign(new Error('sentinel-private'), { statusCode: 400.5 });
  });

  const res500 = await app.inject({ method: 'GET', url: '/__test-error-500' });
  assert.equal(res500.statusCode, 500);
  assert.deepEqual(res500.json(), {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
  assert.equal(res500.body.includes('test-secret-do-not-log'), false);
  assert.equal(res500.body.includes('generate.test.ts'), false);

  const res409 = await app.inject({ method: 'GET', url: '/__test-error-409' });
  assert.equal(res409.statusCode, 409);
  assert.deepEqual(res409.json(), {
    error: { code: 'REQUEST_ERROR', message: 'Request could not be processed' },
  });
  assert.equal(res409.body.includes('sentinel-private'), false);

  const res503 = await app.inject({ method: 'GET', url: '/__test-error-503' });
  assert.equal(res503.statusCode, 500);
  assert.deepEqual(res503.json(), {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
  assert.equal(res503.body.includes('sentinel-private'), false);

  const resNonInt = await app.inject({ method: 'GET', url: '/__test-error-non-int' });
  assert.equal(resNonInt.statusCode, 500);
  assert.deepEqual(resNonInt.json(), {
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
  assert.equal(resNonInt.body.includes('sentinel-private'), false);

  const notFoundRes = await app.inject({ method: 'POST', url: '/api/unknown' });
  assert.equal(notFoundRes.statusCode, 404);
  assert.deepEqual(notFoundRes.json(), {
    message: 'Route POST:/api/unknown not found',
    error: 'Not Found',
    statusCode: 404,
  });
});
