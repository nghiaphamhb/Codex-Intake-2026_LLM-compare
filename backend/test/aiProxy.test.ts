import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { startUpstream } from './helpers/upstream.js';
import { AiProxyError, createAiProxyClient, type Generate } from '../src/aiProxy.js';

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

test('lists and normalizes catalog', async (t) => {
  let calls = 0;
  let capturedMethod: string | undefined;
  let capturedUrl: string | undefined;
  let capturedApiKey: string | string[] | undefined;
  let capturedBody = '';

  const upstream = await startUpstream(async (req, res) => {
    calls += 1;
    capturedMethod = req.method;
    capturedUrl = req.url;
    capturedApiKey = req.headers['x-api-key'];
    capturedBody = await readRequestBody(req);

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(
      JSON.stringify({
        default: 12345,
        extraTopField: 'ignored',
        models: [
          { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', extraItemField: true },
          { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet' },
          { id: 'google/gemini-pro', name: 'Gemini Pro' },
          { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
          { id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
          { id: 'spacexai/grok-3', name: 'Grok 3' },
          { id: 'meta-llama/llama-3', name: 'Llama 3' },
          { id: 'standalone-model', name: 'Standalone' },
          { id: '/leading-slash', name: 'Leading Slash' },
          { id: 'trailing-slash/', name: 'Trailing Slash' },
          { id: 'constructor/model-1', name: 'Constructor Prefix' },
          { id: '__proto__/model-2', name: 'Proto Prefix' },
        ],
      }),
    );
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 2000,
  });

  const models = await client.listModels();

  assert.equal(calls, 1);
  assert.equal(capturedMethod, 'GET');
  assert.equal(capturedUrl, '/models');
  assert.equal(capturedApiKey, 'test-fake-key');
  assert.equal(capturedBody, '');

  assert.deepEqual(models, [
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' },
    { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet', provider: 'Anthropic' },
    { id: 'google/gemini-pro', name: 'Gemini Pro', provider: 'Google' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
    { id: 'moonshotai/kimi-k2', name: 'Kimi K2', provider: 'Moonshot AI' },
    { id: 'spacexai/grok-3', name: 'Grok 3', provider: 'xAI' },
    { id: 'meta-llama/llama-3', name: 'Llama 3', provider: 'meta-llama' },
    { id: 'standalone-model', name: 'Standalone', provider: 'Unknown' },
    { id: '/leading-slash', name: 'Leading Slash', provider: 'Unknown' },
    { id: 'trailing-slash/', name: 'Trailing Slash', provider: 'Unknown' },
    { id: 'constructor/model-1', name: 'Constructor Prefix', provider: 'constructor' },
    { id: '__proto__/model-2', name: 'Proto Prefix', provider: '__proto__' },
  ]);
});

test('lists empty catalog without error', async (t) => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [], default: 'missing/default-ignored' }));
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 2000,
  });

  const models = await client.listModels();
  assert.deepEqual(models, []);
});

test('rejects invalid catalog', async (t) => {
  const invalidPayloads: ReadonlyArray<{ name: string; body: string }> = [
    { name: 'missing models property', body: JSON.stringify({}) },
    { name: 'models is null', body: JSON.stringify({ models: null }) },
    { name: 'top-level array', body: JSON.stringify([]) },
    { name: 'top-level primitive', body: JSON.stringify('models') },
    { name: 'models is not array', body: JSON.stringify({ models: 'not-array' }) },
    { name: 'model item is null', body: JSON.stringify({ models: [null] }) },
    { name: 'model item is array', body: JSON.stringify({ models: [[]] }) },
    { name: 'id wrong type', body: JSON.stringify({ models: [{ id: 123, name: 'A' }] }) },
    { name: 'id empty', body: JSON.stringify({ models: [{ id: '', name: 'A' }] }) },
    {
      name: 'id surrounding whitespace',
      body: JSON.stringify({ models: [{ id: ' a', name: 'A' }] }),
    },
    { name: 'name wrong type', body: JSON.stringify({ models: [{ id: 'a', name: 123 }] }) },
    { name: 'name empty', body: JSON.stringify({ models: [{ id: 'a', name: '' }] }) },
    {
      name: 'name surrounding whitespace',
      body: JSON.stringify({ models: [{ id: 'a', name: 'A ' }] }),
    },
    {
      name: 'duplicate ids',
      body: JSON.stringify({
        models: [
          { id: 'openai/a', name: 'A1' },
          { id: 'openai/a', name: 'A2' },
        ],
      }),
    },
    { name: 'malformed JSON', body: '{invalid-json' },
    { name: 'HTML response', body: '<html><body>Error</body></html>' },
  ];

  let nextBody = '{}';
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(nextBody);
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 2000,
  });

  for (const testCase of invalidPayloads) {
    await t.test(testCase.name, async () => {
      nextBody = testCase.body;
      await assert.rejects(
        () => client.listModels(),
        (err: unknown) => {
          assert.ok(err instanceof AiProxyError);
          assert.equal(err.code, 'UPSTREAM_INVALID_RESPONSE');
          assert.equal(err.statusCode, 502);
          return true;
        },
      );
    });
  }
});

test('preserves base URL prefix when calling /models', async (t) => {
  let capturedUrl: string | undefined;
  const upstream = await startUpstream((req, res) => {
    capturedUrl = req.url;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5', name: 'GPT-5' }] }));
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: `${upstream.baseUrl}/proxy/`,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 2000,
  });

  const models = await client.listModels();
  assert.equal(capturedUrl, '/proxy/models');
  assert.deepEqual(models, [{ id: 'openai/gpt-5', name: 'GPT-5', provider: 'OpenAI' }]);
});

test('rejects redirect without forwarding key', async (t) => {
  let targetCalls = 0;
  const targetUpstream = await startUpstream((_req, res) => {
    targetCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
  });
  t.after(() => targetUpstream.close());

  const redirectUpstream = await startUpstream((_req, res) => {
    res.writeHead(302, { location: `${targetUpstream.baseUrl}/models` });
    res.end();
  });
  t.after(() => redirectUpstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: redirectUpstream.baseUrl,
    llmApiKey: 'secret-should-not-forward',
    llmTimeoutMs: 2000,
  });

  await assert.rejects(
    () => client.listModels(),
    (err: unknown) => {
      assert.ok(err instanceof AiProxyError);
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.equal(err.statusCode, 502);
      return true;
    },
  );
  assert.equal(targetCalls, 0);
});

test('generate sends exact payload/headers, preserves text, and measures body duration without this binding', async (t) => {
  let calls = 0;
  let capturedMethod: string | undefined;
  let capturedUrl: string | undefined;
  let capturedApiKey: string | string[] | undefined;
  let capturedContentType: string | string[] | undefined;
  let capturedBody = '';
  let nextText = '  # Title\n\nAnswer  ';
  let delayBodyMs = 0;

  const upstream = await startUpstream(async (req, res) => {
    calls += 1;
    capturedMethod = req.method;
    capturedUrl = req.url;
    capturedApiKey = req.headers['x-api-key'];
    capturedContentType = req.headers['content-type'];
    capturedBody = await readRequestBody(req);

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.flushHeaders();
    if (delayBodyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBodyMs));
    }
    res.end(JSON.stringify({ text: nextText, extraField: 'ignored' }));
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: `${upstream.baseUrl}/proxy/`,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 2000,
  });

  const generate: Generate = client.generate;
  delayBodyMs = 60;
  const result = await generate({
    prompt: '  Hello\n```ts\n1 + 1\n```  ',
    modelId: 'openai/gpt-5-mini',
  });

  assert.equal(calls, 1);
  assert.equal(capturedMethod, 'POST');
  assert.equal(capturedUrl, '/proxy/generate');
  assert.equal(capturedApiKey, 'test-fake-key');
  assert.match(String(capturedContentType), /application\/json/);
  assert.deepEqual(JSON.parse(capturedBody), {
    prompt: '  Hello\n```ts\n1 + 1\n```  ',
    model: 'openai/gpt-5-mini',
  });
  assert.equal('modelId' in JSON.parse(capturedBody), false);
  assert.equal(result.text, '  # Title\n\nAnswer  ');
  assert.equal(Number.isFinite(result.durationMs), true);
  assert.ok(result.durationMs >= 25);

  delayBodyMs = 0;
  nextText = '';
  const emptyResult = await generate({ prompt: 'Empty?', modelId: 'openai/gpt-5-mini' });
  assert.equal(emptyResult.text, '');
  assert.equal(Number.isFinite(emptyResult.durationMs), true);
  assert.ok(emptyResult.durationMs >= 0);
});

test(
  'generate maps upstream non-200 statuses including HTML and unended bodies without retry',
  { timeout: 10000 },
  async (t) => {
    const statusCases: ReadonlyArray<{
      name: string;
      status: number;
      body?: string;
      unended?: boolean;
      expectedCode: string;
      expectedStatus: number;
    }> = [
      {
        name: '401 auth error with HTML body',
        status: 401,
        body: '<html><body>Unauthorized secret-upstream</body></html>',
        expectedCode: 'UPSTREAM_AUTH_ERROR',
        expectedStatus: 502,
      },
      {
        name: '403 auth error',
        status: 403,
        body: JSON.stringify({ error: 'forbidden' }),
        expectedCode: 'UPSTREAM_AUTH_ERROR',
        expectedStatus: 502,
      },
      {
        name: '429 rate limit',
        status: 429,
        body: '<html>Too many requests</html>',
        expectedCode: 'UPSTREAM_LIMIT_EXCEEDED',
        expectedStatus: 429,
      },
      {
        name: '400 upstream bad request',
        status: 400,
        body: JSON.stringify({ message: 'Unknown model' }),
        expectedCode: 'UPSTREAM_ERROR',
        expectedStatus: 502,
      },
      {
        name: '500 upstream error',
        status: 500,
        body: '<html>Server Error</html>',
        expectedCode: 'UPSTREAM_ERROR',
        expectedStatus: 502,
      },
      {
        name: '401 unended body returns auth error immediately without waiting for timeout',
        status: 401,
        unended: true,
        expectedCode: 'UPSTREAM_AUTH_ERROR',
        expectedStatus: 502,
      },
    ];

    let currentCase = statusCases[0];
    let calls = 0;
    const upstream = await startUpstream(async (req, res) => {
      calls += 1;
      await readRequestBody(req);
      res.writeHead(currentCase.status, { 'content-type': 'text/html' });
      res.flushHeaders();
      if (!currentCase.unended) {
        res.end(currentCase.body ?? '');
      }
    });
    t.after(() => upstream.close());

    const client = createAiProxyClient({
      llmBaseUrl: upstream.baseUrl,
      llmApiKey: 'test-fake-key',
      llmTimeoutMs: 1500,
    });

    for (const testCase of statusCases) {
      await t.test(testCase.name, async () => {
        currentCase = testCase;
        const callsBefore = calls;
        await assert.rejects(
          () => client.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
          (err: unknown) => {
            assert.ok(err instanceof AiProxyError);
            assert.equal(err.code, testCase.expectedCode);
            assert.equal(err.statusCode, testCase.expectedStatus);
            assert.equal(err.message.includes('secret-upstream'), false);
            return true;
          },
        );
        assert.equal(calls - callsBefore, 1);
      });
    }
  },
);

test('generate rejects 200 responses with invalid JSON or text contract', async (t) => {
  const invalidBodies: ReadonlyArray<{ name: string; body: string }> = [
    { name: 'malformed JSON', body: '{bad' },
    { name: 'HTML body', body: '<html>ok</html>' },
    { name: 'top-level array', body: JSON.stringify([]) },
    { name: 'top-level null', body: JSON.stringify(null) },
    { name: 'missing text field', body: JSON.stringify({ content: 'hi' }) },
    { name: 'text is null', body: JSON.stringify({ text: null }) },
    { name: 'text is number', body: JSON.stringify({ text: 123 }) },
  ];

  let nextBody = '{}';
  const upstream = await startUpstream(async (req, res) => {
    await readRequestBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(nextBody);
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 1500,
  });

  for (const testCase of invalidBodies) {
    await t.test(testCase.name, async () => {
      nextBody = testCase.body;
      await assert.rejects(
        () => client.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
        (err: unknown) => {
          assert.ok(err instanceof AiProxyError);
          assert.equal(err.code, 'UPSTREAM_INVALID_RESPONSE');
          assert.equal(err.statusCode, 502);
          return true;
        },
      );
    });
  }
});

test('generate maps network failures, mid-body socket destroy, and redirects to UPSTREAM_ERROR', async (t) => {
  const closedServer = await startUpstream((_req, res) => {
    res.end();
  });
  const closedBaseUrl = closedServer.baseUrl;
  await closedServer.close();

  const unreachableClient = createAiProxyClient({
    llmBaseUrl: closedBaseUrl,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 1500,
  });
  await assert.rejects(
    () => unreachableClient.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
    (err: unknown) => {
      assert.ok(err instanceof AiProxyError);
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.equal(err.statusCode, 502);
      return true;
    },
  );

  let socketAbortCalls = 0;
  const dropUpstream = await startUpstream(async (req, res) => {
    socketAbortCalls += 1;
    await readRequestBody(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.flushHeaders();
    res.write('{"text":"partial');
    res.socket?.destroy();
  });
  t.after(() => dropUpstream.close());

  const dropClient = createAiProxyClient({
    llmBaseUrl: dropUpstream.baseUrl,
    llmApiKey: 'test-fake-key',
    llmTimeoutMs: 1500,
  });
  await assert.rejects(
    () => dropClient.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
    (err: unknown) => {
      assert.ok(err instanceof AiProxyError);
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.equal(err.statusCode, 502);
      return true;
    },
  );
  assert.equal(socketAbortCalls, 1);

  let targetCalls = 0;
  const targetServer = await startUpstream((_req, res) => {
    targetCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ text: 'redirected' }));
  });
  t.after(() => targetServer.close());

  const redirectServer = await startUpstream((_req, res) => {
    res.writeHead(302, { location: `${targetServer.baseUrl}/generate` });
    res.end();
  });
  t.after(() => redirectServer.close());

  const redirectClient = createAiProxyClient({
    llmBaseUrl: redirectServer.baseUrl,
    llmApiKey: 'secret-not-forwarded',
    llmTimeoutMs: 1500,
  });
  await assert.rejects(
    () => redirectClient.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
    (err: unknown) => {
      assert.ok(err instanceof AiProxyError);
      assert.equal(err.code, 'UPSTREAM_ERROR');
      assert.equal(err.statusCode, 502);
      return true;
    },
  );
  assert.equal(targetCalls, 0);
});

test(
  'generate enforces deadline before headers and while reading slow body without retry',
  { timeout: 5000 },
  async (t) => {
    let beforeHeaderCalls = 0;
    const silentUpstream = await startUpstream((_req, _res) => {
      beforeHeaderCalls += 1;
      // Intentionally never send headers
    });
    t.after(() => silentUpstream.close());

    const fastTimeoutClient = createAiProxyClient({
      llmBaseUrl: silentUpstream.baseUrl,
      llmApiKey: 'test-fake-key',
      llmTimeoutMs: 150,
    });

    await assert.rejects(
      () => fastTimeoutClient.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_TIMEOUT');
        assert.equal(err.statusCode, 504);
        return true;
      },
    );
    assert.equal(beforeHeaderCalls, 1);

    let afterHeaderCalls = 0;
    const slowBodyUpstream = await startUpstream(async (req, res) => {
      afterHeaderCalls += 1;
      await readRequestBody(req);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.flushHeaders();
      res.write('{"text":"hanging');
      // Intentionally never finish body
    });
    t.after(() => slowBodyUpstream.close());

    const bodyTimeoutClient = createAiProxyClient({
      llmBaseUrl: slowBodyUpstream.baseUrl,
      llmApiKey: 'test-fake-key',
      llmTimeoutMs: 150,
    });

    await assert.rejects(
      () => bodyTimeoutClient.generate({ prompt: 'Hello', modelId: 'openai/gpt-5' }),
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_TIMEOUT');
        assert.equal(err.statusCode, 504);
        return true;
      },
    );
    assert.equal(afterHeaderCalls, 1);
  },
);
