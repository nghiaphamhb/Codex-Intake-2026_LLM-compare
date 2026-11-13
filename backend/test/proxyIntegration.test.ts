import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { buildApp } from '../src/app.js';
import { createAiProxyClient } from '../src/aiProxy.js';
import { startUpstream } from './helpers/upstream.js';

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function createBarrier(expectedCount: number, timeoutMs = 2000) {
  let arrived = 0;
  let settled = false;
  let resolveBarrier!: () => void;
  let rejectBarrier!: (err: Error) => void;

  const promise = new Promise<void>((resolve, reject) => {
    resolveBarrier = resolve;
    rejectBarrier = reject;
  });

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectBarrier(
        new Error(`Barrier timed out waiting for ${expectedCount} requests (got ${arrived})`),
      );
    }
  }, timeoutMs);

  return {
    async arrive(): Promise<void> {
      arrived += 1;
      if (arrived >= expectedCount && !settled) {
        settled = true;
        clearTimeout(timer);
        resolveBarrier();
      }
      return promise;
    },
    cleanup(): void {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        rejectBarrier(new Error('Barrier cleaned up before completion'));
      }
    },
  };
}

test('full integration overlaps 2, 3, and 4 concurrent model requests while fetching catalog once', async (t) => {
  const catalogFixture = [
    { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' },
    { id: 'anthropic/claude-sonnet', name: 'Claude Sonnet' },
    { id: 'google/gemini-pro', name: 'Gemini Pro' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat' },
  ];

  for (const concurrency of [2, 3, 4]) {
    await t.test(`${concurrency} concurrent models overlap`, async (subtest) => {
      let modelsCalls = 0;
      let generateCalls = 0;
      const barrier = createBarrier(concurrency);
      subtest.after(() => barrier.cleanup());

      const upstream = await startUpstream(async (req, res) => {
        if (req.method === 'GET' && req.url === '/models') {
          modelsCalls += 1;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ models: catalogFixture.slice(0, concurrency) }));
          return;
        }
        if (req.method === 'POST' && req.url === '/generate') {
          generateCalls += 1;
          const body = await readJsonBody(req);
          const model = String(body.model);
          const prompt = String(body.prompt);
          await barrier.arrive();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ text: `Answer for ${model}: ${prompt}` }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
      subtest.after(() => upstream.close());

      const client = createAiProxyClient({
        llmBaseUrl: upstream.baseUrl,
        llmApiKey: 'integration-fake-key',
        llmTimeoutMs: 3000,
      });
      const models = await client.listModels();
      const app = buildApp({ logger: false, models, generate: client.generate });
      subtest.after(() => app.close());

      const catalogRes = await app.inject({ method: 'GET', url: '/api/models' });
      assert.equal(catalogRes.statusCode, 200);

      const selectedIds = models.map((m) => m.id);
      const pending = selectedIds.map((modelId) =>
        app.inject({
          method: 'POST',
          url: '/api/generate',
          payload: { prompt: 'Compare models', modelId },
        }),
      );
      const responses = await Promise.all(pending);

      assert.equal(modelsCalls, 1);
      assert.equal(generateCalls, concurrency);
      for (let i = 0; i < selectedIds.length; i += 1) {
        const res = responses[i];
        assert.equal(res.statusCode, 200);
        const json = res.json() as { modelId: string; text: string; durationMs: number };
        assert.equal(json.modelId, selectedIds[i]);
        assert.equal(json.text, `Answer for ${selectedIds[i]}: Compare models`);
        assert.equal(Number.isFinite(json.durationMs), true);
        assert.ok(json.durationMs >= 0);
      }
    });
  }
});

test('concurrent upstream HTTP error isolates failing model from succeeding models', async (t) => {
  const barrier = createBarrier(3);
  t.after(() => barrier.cleanup());

  let modelsCalls = 0;
  let generateCalls = 0;
  const upstream = await startUpstream(async (req, res) => {
    if (req.method === 'GET' && req.url === '/models') {
      modelsCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            { id: 'openai/gpt-5', name: 'GPT-5' },
            { id: 'anthropic/claude', name: 'Claude' },
            { id: 'google/gemini', name: 'Gemini' },
          ],
        }),
      );
      return;
    }
    if (req.method === 'POST' && req.url === '/generate') {
      generateCalls += 1;
      const body = await readJsonBody(req);
      const model = String(body.model);
      await barrier.arrive();

      if (model === 'anthropic/claude') {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'rate limit' }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: `ok:${model}` }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'integration-fake-key',
    llmTimeoutMs: 3000,
  });
  const models = await client.listModels();
  const app = buildApp({ logger: false, models, generate: client.generate });
  t.after(() => app.close());

  const [res1, res2, res3] = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hello', modelId: 'openai/gpt-5' },
    }),
    app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hello', modelId: 'anthropic/claude' },
    }),
    app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hello', modelId: 'google/gemini' },
    }),
  ]);

  assert.equal(modelsCalls, 1);
  assert.equal(generateCalls, 3);

  assert.equal(res1.statusCode, 200);
  assert.equal(res1.json().text, 'ok:openai/gpt-5');

  assert.equal(res2.statusCode, 429);
  assert.deepEqual(res2.json(), {
    error: { code: 'UPSTREAM_LIMIT_EXCEEDED', message: 'Model service limit exceeded' },
  });

  assert.equal(res3.statusCode, 200);
  assert.equal(res3.json().text, 'ok:google/gemini');
});

test(
  'concurrent upstream timeout isolates slow model from fast models',
  { timeout: 5000 },
  async (t) => {
    const barrier = createBarrier(3);
    t.after(() => barrier.cleanup());

    let generateCalls = 0;
    const upstream = await startUpstream(async (req, res) => {
      if (req.method === 'GET' && req.url === '/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              { id: 'openai/fast-1', name: 'Fast 1' },
              { id: 'anthropic/hanging', name: 'Hanging' },
              { id: 'google/fast-2', name: 'Fast 2' },
            ],
          }),
        );
        return;
      }
      if (req.method === 'POST' && req.url === '/generate') {
        generateCalls += 1;
        const body = await readJsonBody(req);
        const model = String(body.model);
        await barrier.arrive();

        if (model === 'anthropic/hanging') {
          // Never send response so this invocation hits deadline
          return;
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ text: `fast:${model}` }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    t.after(() => upstream.close());

    const client = createAiProxyClient({
      llmBaseUrl: upstream.baseUrl,
      llmApiKey: 'integration-fake-key',
      llmTimeoutMs: 200,
    });
    const models = await client.listModels();
    const app = buildApp({ logger: false, models, generate: client.generate });
    t.after(() => app.close());

    const [res1, res2, res3] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/generate',
        payload: { prompt: 'Hello', modelId: 'openai/fast-1' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/generate',
        payload: { prompt: 'Hello', modelId: 'anthropic/hanging' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/generate',
        payload: { prompt: 'Hello', modelId: 'google/fast-2' },
      }),
    ]);

    assert.equal(generateCalls, 3);
    assert.equal(res1.statusCode, 200);
    assert.equal(res1.json().text, 'fast:openai/fast-1');

    assert.equal(res2.statusCode, 504);
    assert.deepEqual(res2.json(), {
      error: { code: 'UPSTREAM_TIMEOUT', message: 'Model service timed out' },
    });

    assert.equal(res3.statusCode, 200);
    assert.equal(res3.json().text, 'fast:google/fast-2');
  },
);

test('manual retry only invokes failed model a second time without re-calling succeeded models or catalog', async (t) => {
  let modelsCalls = 0;
  const counts = new Map<string, number>();

  const upstream = await startUpstream(async (req, res) => {
    if (req.method === 'GET' && req.url === '/models') {
      modelsCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [
            { id: 'openai/gpt-5', name: 'GPT-5' },
            { id: 'anthropic/claude', name: 'Claude' },
          ],
        }),
      );
      return;
    }
    if (req.method === 'POST' && req.url === '/generate') {
      const body = await readJsonBody(req);
      const model = String(body.model);
      const attempt = (counts.get(model) ?? 0) + 1;
      counts.set(model, attempt);

      if (model === 'anthropic/claude' && attempt === 1) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'transient upstream error' }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: `answer:${model}:attempt-${attempt}` }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => upstream.close());

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'integration-fake-key',
    llmTimeoutMs: 2000,
  });
  const models = await client.listModels();
  const app = buildApp({ logger: false, models, generate: client.generate });
  t.after(() => app.close());

  const [firstA, firstB] = await Promise.all([
    app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hello', modelId: 'openai/gpt-5' },
    }),
    app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hello', modelId: 'anthropic/claude' },
    }),
  ]);

  assert.equal(firstA.statusCode, 200);
  assert.equal(firstA.json().text, 'answer:openai/gpt-5:attempt-1');

  assert.equal(firstB.statusCode, 502);
  assert.deepEqual(firstB.json(), {
    error: { code: 'UPSTREAM_ERROR', message: 'Model service request failed' },
  });

  const retryB = await app.inject({
    method: 'POST',
    url: '/api/generate',
    payload: { prompt: 'Hello', modelId: 'anthropic/claude' },
  });

  assert.equal(retryB.statusCode, 200);
  assert.equal(retryB.json().modelId, 'anthropic/claude');
  assert.equal(retryB.json().text, 'answer:anthropic/claude:attempt-2');

  assert.equal(modelsCalls, 1);
  assert.equal(counts.get('openai/gpt-5'), 1);
  assert.equal(counts.get('anthropic/claude'), 2);
});
