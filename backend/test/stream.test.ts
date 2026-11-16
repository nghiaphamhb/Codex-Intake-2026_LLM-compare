import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { AiProxyError, type StreamGenerate } from '../src/aiProxy.js';
import { startUpstream } from './helpers/upstream.js';
import type { Model } from '../src/models.js';

const TEST_MODELS: Model[] = [
  {
    id: 'test/standard-model',
    name: 'Standard Model',
    provider: 'Test',
    pricing: { input: 0.25, output: 2.0 },
  },
  {
    id: 'test/free-model',
    name: 'Free Model',
    provider: 'Test',
  },
];

test('POST /api/stream validation: rejects invalid bodies with 400 envelope and 0 streamGenerate calls', async () => {
  let streamCalls = 0;
  const mockStreamGenerate: StreamGenerate = async () => {
    streamCalls++;
    return { durationMs: 100 };
  };

  const app = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockStreamGenerate,
  });

  // Invalid JSON body
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: 'not a json',
  });
  assert.equal(res1.statusCode, 400);
  assert.deepEqual(res1.json(), {
    error: { code: 'INVALID_REQUEST', message: 'Invalid request body' },
  });

  // Missing fields
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello' }),
  });
  assert.equal(res2.statusCode, 400);

  // Extra field
  const res3 = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello', modelId: 'test/standard-model', extra: 1 }),
  });
  assert.equal(res3.statusCode, 400);

  // Blank prompt
  const res4 = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '   \n  \t  ', modelId: 'test/standard-model' }),
  });
  assert.equal(res4.statusCode, 400);
  assert.deepEqual(res4.json(), {
    error: { code: 'INVALID_REQUEST', message: 'Prompt must not be blank' },
  });

  // Unknown modelId
  const res5 = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello', modelId: 'unknown/model' }),
  });
  assert.equal(res5.statusCode, 400);
  assert.deepEqual(res5.json(), {
    error: { code: 'INVALID_REQUEST', message: 'Unknown modelId' },
  });

  // Missing streamGenerate dependency -> 503
  const appNoStream = buildApp({
    models: TEST_MODELS,
  });
  const res6 = await appNoStream.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello', modelId: 'test/standard-model' }),
  });
  assert.equal(res6.statusCode, 503);
  assert.deepEqual(res6.json(), {
    error: { code: 'GENERATION_UNAVAILABLE', message: 'Text generation is not configured' },
  });

  assert.equal(streamCalls, 0, 'streamGenerate must not be invoked on validation failure');
});

test('POST /api/stream success: emits start, deltas, and done with correct cost and duration', async () => {
  const mockStreamGenerate: StreamGenerate = async (input, options) => {
    assert.equal(input.prompt, '  hello world  ');
    assert.equal(input.modelId, 'test/standard-model');
    await options.onReady(options.signal);
    await options.onDelta({ type: 'reasoning-delta', delta: 'think' }, options.signal);
    await options.onDelta({ type: 'text-delta', delta: 'answer' }, options.signal);
    return {
      durationMs: 123.45,
      usage: { inputTokens: 1000, outputTokens: 675 },
    };
  };

  const app = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockStreamGenerate,
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '  hello world  ', modelId: 'test/standard-model' }),
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'application/x-ndjson; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'no-cache, no-transform');
  assert.equal(res.headers['x-accel-buffering'], 'no');

  const lines = res.payload
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0], { type: 'start', modelId: 'test/standard-model' });
  assert.deepEqual(lines[1], { type: 'reasoning-delta', delta: 'think' });
  assert.deepEqual(lines[2], { type: 'text-delta', delta: 'answer' });
  assert.equal(lines[3].type, 'done');
  assert.equal(lines[3].durationMs, 123.45);
  // Cost: 1000 * 0.25/1M + 675 * 2.0/1M = 0.00025 + 0.00135 = 0.0016
  assert.ok(Math.abs(lines[3].costUsd - 0.0016) < 1e-9);
});

test('POST /api/stream cost edge cases: zero tokens and missing pricing/usage yield valid costUsd', async () => {
  // Free model with missing pricing
  const mockStreamGenerate1: StreamGenerate = async (_input, options) => {
    await options.onReady(options.signal);
    return { durationMs: 50, usage: { inputTokens: 100, outputTokens: 100 } };
  };

  const app = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockStreamGenerate1,
  });

  const res1 = await app.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi', modelId: 'test/free-model' }),
  });
  const lines1 = res1.payload
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(lines1[lines1.length - 1].costUsd, null);

  // Standard model with 0 tokens -> cost 0
  const mockStreamGenerate2: StreamGenerate = async (_input, options) => {
    await options.onReady(options.signal);
    return { durationMs: 50, usage: { inputTokens: 0, outputTokens: 0 } };
  };
  const app2 = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockStreamGenerate2,
  });
  const res2 = await app2.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi', modelId: 'test/standard-model' }),
  });
  const lines2 = res2.payload
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(lines2[lines2.length - 1].costUsd, 0);
});

test('POST /api/stream errors: HTTP error before onReady, NDJSON error after onReady', async () => {
  // 1. Error before onReady -> HTTP JSON error
  const mockFailBeforeReady: StreamGenerate = async () => {
    throw new AiProxyError('UPSTREAM_LIMIT_EXCEEDED');
  };
  const app1 = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockFailBeforeReady,
  });
  const res1 = await app1.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi', modelId: 'test/standard-model' }),
  });
  assert.equal(res1.statusCode, 429);
  assert.deepEqual(res1.json(), {
    error: { code: 'UPSTREAM_LIMIT_EXCEEDED', message: 'Model service limit exceeded' },
  });

  // 2. Error after onReady -> HTTP 200, NDJSON error event
  const mockFailAfterReady: StreamGenerate = async (_input, options) => {
    await options.onReady(options.signal);
    await options.onDelta({ type: 'text-delta', delta: 'some text' }, options.signal);
    throw new AiProxyError('UPSTREAM_TIMEOUT');
  };
  const app2 = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockFailAfterReady,
  });
  const res2 = await app2.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi', modelId: 'test/standard-model' }),
  });
  assert.equal(res2.statusCode, 200);
  const lines2 = res2.payload
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.equal(lines2.length, 3);
  assert.deepEqual(lines2[0], { type: 'start', modelId: 'test/standard-model' });
  assert.deepEqual(lines2[1], { type: 'text-delta', delta: 'some text' });
  assert.deepEqual(lines2[2], {
    type: 'error',
    error: { code: 'UPSTREAM_TIMEOUT', message: 'Model service timed out' },
  });

  // 3. Unexpected internal error after onReady -> sanitized INTERNAL_ERROR
  const mockInternalError: StreamGenerate = async (_input, options) => {
    await options.onReady(options.signal);
    throw new Error('DATABASE_PASSWORD_LEAK');
  };
  const app3 = buildApp({
    models: TEST_MODELS,
    streamGenerate: mockInternalError,
  });
  const res3 = await app3.inject({
    method: 'POST',
    url: '/api/stream',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'hi', modelId: 'test/standard-model' }),
  });
  assert.equal(res3.statusCode, 200);
  const lines3 = res3.payload
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  assert.deepEqual(lines3[1], {
    type: 'error',
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
  assert.ok(!res3.payload.includes('DATABASE_PASSWORD_LEAK'));
});

import { writeNdjsonEvent, safeWriteTerminalEvent } from '../src/routes/stream.js';
import { EventEmitter } from 'node:events';
import { createAiProxyClient } from '../src/aiProxy.js';

test('safeWriteTerminalEvent: destroys the response if terminal write fails', () => {
  let destroyed = false;
  const raw = {
    writable: true,
    writableEnded: false,
    destroyed: false,
    write: () => {
      throw new Error('socket write failed');
    },
    end: () => {},
    destroy: () => {
      destroyed = true;
    },
  };
  safeWriteTerminalEvent(
    raw,
    { type: 'done', durationMs: 1, costUsd: null },
    { terminalSent: false },
  );
  assert.equal(destroyed, true, 'a failed terminal write must not leave the response open');
});

test('writeNdjsonEvent: backpressure pauses until drain and cleans up on abort/close', async () => {
  class MockWritable extends EventEmitter {
    writable = true;
    writableEnded = false;
    destroyed = false;
    written: string[] = [];
    shouldPause = false;

    write(chunk: string): boolean {
      this.written.push(chunk);
      return !this.shouldPause;
    }
  }

  // 1. Normal drain unblocks
  const mock1 = new MockWritable();
  mock1.shouldPause = true;
  const signal1 = new AbortController().signal;

  let writeFinished = false;
  const writePromise = writeNdjsonEvent(
    mock1,
    { type: 'text-delta', delta: 'chunk-1' },
    signal1,
  ).then(() => {
    writeFinished = true;
  });

  assert.equal(writeFinished, false);
  assert.equal(mock1.listenerCount('drain'), 1);
  mock1.emit('drain');
  await writePromise;
  assert.equal(writeFinished, true);
  assert.equal(mock1.listenerCount('drain'), 0);

  // 2. Abort wakes up waiter and cleans up all listeners
  const mock2 = new MockWritable();
  mock2.shouldPause = true;
  const controller2 = new AbortController();

  let abortFinished = false;
  const abortPromise = writeNdjsonEvent(
    mock2,
    { type: 'text-delta', delta: 'chunk-2' },
    controller2.signal,
  ).then(() => {
    abortFinished = true;
  });

  assert.equal(abortFinished, false);
  assert.equal(mock2.listenerCount('drain'), 1);
  assert.equal(mock2.listenerCount('close'), 1);
  controller2.abort();
  await abortPromise;
  assert.equal(abortFinished, true);
  assert.equal(mock2.listenerCount('drain'), 0);
  assert.equal(mock2.listenerCount('close'), 0);

  // 3. Close event wakes up waiter
  const mock3 = new MockWritable();
  mock3.shouldPause = true;
  const signal3 = new AbortController().signal;

  let closeFinished = false;
  const closePromise = writeNdjsonEvent(
    mock3,
    { type: 'text-delta', delta: 'chunk-3' },
    signal3,
  ).then(() => {
    closeFinished = true;
  });

  mock3.emit('close');
  await closePromise;
  assert.equal(closeFinished, true);
  assert.equal(mock3.listenerCount('drain'), 0);
});

test('safeWriteTerminalEvent: guards against duplicate terminal events and handles destroyed streams', () => {
  let writes = 0;
  let ends = 0;
  let destroys = 0;

  const mock = {
    writable: true,
    writableEnded: false,
    destroyed: false,
    write: () => {
      writes++;
      return false; // Terminal must end even when writable backpressure is active.
    },
    end: () => {
      ends++;
    },
    destroy: () => {
      destroys++;
    },
  };

  const state = { terminalSent: false };

  safeWriteTerminalEvent(mock, { type: 'done', durationMs: 10, costUsd: 0 }, state);
  assert.equal(writes, 1);
  assert.equal(ends, 1);
  assert.equal(state.terminalSent, true);

  // Second call does nothing
  safeWriteTerminalEvent(
    mock,
    { type: 'error', error: { code: 'UPSTREAM_TIMEOUT', message: 'timeout' } },
    state,
  );
  assert.equal(writes, 1);
  assert.equal(ends, 1);

  // Non-writable stream calls destroy
  const state2 = { terminalSent: false };
  const mockNonWritable = {
    writable: false,
    writableEnded: true,
    destroyed: true,
    write: () => true,
    end: () => {},
    destroy: () => {
      destroys++;
    },
  };
  safeWriteTerminalEvent(mockNonWritable, { type: 'done', durationMs: 10, costUsd: 0 }, state2);
  assert.equal(destroys, 1);
});

test('real socket HTTP stream: incremental delivery before upstream finish', async () => {
  let allowFinishResolve: () => void;
  const allowFinish = new Promise<void>((r) => {
    allowFinishResolve = r;
  });

  const upstream = await startUpstream(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ type: 'start' }) + '\n');
    res.write(JSON.stringify({ type: 'text-delta', delta: 'chunk1 ' }) + '\n');
    res.write(JSON.stringify({ type: 'text-delta', delta: 'chunk2' }) + '\n');
    await allowFinish;
    res.write(JSON.stringify({ type: 'finish' }) + '\n');
    res.end();
  });

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-key',
    llmTimeoutMs: 1000,
  });

  const app = buildApp({
    models: TEST_MODELS,
    streamGenerate: client.streamGenerate,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const serverPort = (app.server.address() as AddressInfo).port;

  try {
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'stream me', modelId: 'test/free-model' }),
    });

    assert.equal(response.status, 200);
    assert.ok(response.body);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    // Read first chunk: must get start and chunk1 while upstream finish is still held by barrier
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value);
      if (accumulated.includes('chunk2')) {
        break;
      }
    }

    assert.ok(accumulated.includes('start'));
    assert.ok(accumulated.includes('chunk1 '));
    assert.ok(accumulated.includes('chunk2'));
    assert.ok(!accumulated.includes('done'), 'done must not be sent before finish barrier opens');

    // Now release upstream barrier
    allowFinishResolve!();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value);
    }

    assert.ok(accumulated.includes('done'));
  } finally {
    app.server.closeAllConnections?.();
    await app.close();
    await upstream.close();
  }
});

test('real socket HTTP stream: downstream abort cancels upstream and leaves independent request running', async () => {
  let _activeUpstreamRequests = 0;
  let upstreamAClosed = false;

  const upstream = await startUpstream((req, res) => {
    _activeUpstreamRequests++;
    let body = '';
    req.on('data', (c) => (body += c.toString()));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ type: 'text-delta', delta: `from-${parsed.prompt}` }) + '\n');

      if (parsed.prompt === 'request-A') {
        res.on('close', () => {
          _activeUpstreamRequests--;
          upstreamAClosed = true;
        });
      } else {
        setTimeout(() => {
          res.write(JSON.stringify({ type: 'finish' }) + '\n');
          res.end();
          _activeUpstreamRequests--;
        }, 80);
      }
    });
  });

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-key',
    llmTimeoutMs: 2000,
  });

  const app = buildApp({
    models: TEST_MODELS,
    streamGenerate: client.streamGenerate,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const serverPort = (app.server.address() as AddressInfo).port;

  try {
    const controllerA = new AbortController();

    // Start request A
    const resAPromise = fetch(`http://127.0.0.1:${serverPort}/api/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'request-A', modelId: 'test/free-model' }),
      signal: controllerA.signal,
    });

    // Start request B
    const resBPromise = fetch(`http://127.0.0.1:${serverPort}/api/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'request-B', modelId: 'test/free-model' }),
    });

    const resA = await resAPromise;
    const readerA = resA.body!.getReader();
    // Read first chunk from A
    await readerA.read();

    // Now abort request A from client and release reader
    controllerA.abort();
    await readerA.cancel().catch(() => {});

    // Request B should finish successfully despite A's cancellation
    const resB = await resBPromise;
    assert.equal(resB.status, 200);
    const textB = await resB.text();
    assert.ok(textB.includes('from-request-B'));
    assert.ok(textB.includes('done'));

    // Verify upstream A closed and active requests cleaned up
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(upstreamAClosed, 'upstream for request A must be closed on abort');
  } finally {
    app.server.closeAllConnections?.();
    await app.close();
    await upstream.close();
  }
});

test('real socket HTTP stream: four model results isolate HTTP failure and manual retry', async () => {
  const modelAttempts: Record<string, number> = {};

  const upstream = await startUpstream((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c.toString()));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const m = parsed.model;
      modelAttempts[m] = (modelAttempts[m] ?? 0) + 1;

      if (m === 'test/failing-model') {
        res.writeHead(429, { 'content-type': 'text/plain' });
        res.end('Rate limit exceeded');
        return;
      }

      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ type: 'start' }) + '\n');
      res.write(JSON.stringify({ type: 'text-delta', delta: `res-${m}` }) + '\n');
      res.write(JSON.stringify({ type: 'finish' }) + '\n');
      res.end();
    });
  });

  const OVERLAP_MODELS: Model[] = [
    { id: 'test/m1', name: 'M1', provider: 'Test' },
    { id: 'test/m2', name: 'M2', provider: 'Test' },
    { id: 'test/m3', name: 'M3', provider: 'Test' },
    { id: 'test/failing-model', name: 'Failing Model', provider: 'Test' },
  ];

  const client = createAiProxyClient({
    llmBaseUrl: upstream.baseUrl,
    llmApiKey: 'test-key',
    llmTimeoutMs: 2000,
  });

  const app = buildApp({
    models: OVERLAP_MODELS,
    streamGenerate: client.streamGenerate,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const serverPort = (app.server.address() as AddressInfo).port;

  try {
    // Fire 4 concurrent requests
    const promises = OVERLAP_MODELS.map((model) =>
      fetch(`http://127.0.0.1:${serverPort}/api/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'test concurrent', modelId: model.id }),
      }).then(async (r) => ({
        modelId: model.id,
        status: r.status,
        bodyText: await r.text(),
      })),
    );

    const results = await Promise.all(promises);

    const failed = results.find((r) => r.modelId === 'test/failing-model');
    assert.equal(failed?.status, 429);
    assert.ok(failed?.bodyText.includes('UPSTREAM_LIMIT_EXCEEDED'));

    const succeeded = results.filter((r) => r.modelId !== 'test/failing-model');
    assert.equal(succeeded.length, 3);
    for (const s of succeeded) {
      assert.equal(s.status, 200);
      assert.ok(s.bodyText.includes(`res-${s.modelId}`));
      assert.ok(s.bodyText.includes('done'));
    }

    // Now test retry on the failed model only
    const retryRes = await fetch(`http://127.0.0.1:${serverPort}/api/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'test concurrent', modelId: 'test/failing-model' }),
    });
    assert.equal(retryRes.status, 429);
    // Assert only failing-model had an extra attempt, succeeding models were not recalled
    assert.equal(modelAttempts['test/failing-model'], 2);
    assert.equal(modelAttempts['test/m1'], 1);
    assert.equal(modelAttempts['test/m2'], 1);
    assert.equal(modelAttempts['test/m3'], 1);
  } finally {
    app.server.closeAllConnections?.();
    await app.close();
    await upstream.close();
  }
});

test(
  'real socket HTTP stream: 2, 3 and 4 requests all reach upstream before any finish',
  { timeout: 10000 },
  async (t) => {
    for (const size of [2, 3, 4]) {
      await t.test(`${size} overlapping streams`, async (t) => {
        let active = 0;
        let maxActive = 0;
        const finishers: (() => void)[] = [];
        const upstream = await startUpstream((_req, res) => {
          active++;
          maxActive = Math.max(maxActive, active);
          res.writeHead(200, { 'content-type': 'application/x-ndjson' });
          res.write('{"type":"text-delta","delta":"partial"}\n');
          finishers.push(() => {
            res.end('{"type":"finish"}\n');
            active--;
          });
          // A serialized implementation cannot open this barrier.
          if (finishers.length === size) finishers.forEach((finish) => finish());
        });
        t.after(() => upstream.close());
        const client = createAiProxyClient({
          llmBaseUrl: upstream.baseUrl,
          llmApiKey: 'fake',
          llmTimeoutMs: 2000,
        });
        const models = Array.from({ length: size }, (_, i) => ({
          id: `test/${i}`,
          name: `M${i}`,
          provider: 'Test',
        }));
        const app = buildApp({ models, streamGenerate: client.streamGenerate });
        t.after(async () => {
          app.server.closeAllConnections();
          await app.close();
        });
        await app.listen({ port: 0, host: '127.0.0.1' });
        const port = (app.server.address() as AddressInfo).port;
        const results = await Promise.all(
          models.map(async (model) => {
            const response = await fetch(`http://127.0.0.1:${port}/api/stream`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ prompt: 'overlap', modelId: model.id }),
              signal: AbortSignal.timeout(3000),
            });
            assert.equal(response.status, 200);
            return (await response.text())
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line));
          }),
        );
        assert.equal(maxActive, size);
        assert.equal(active, 0);
        results.forEach((events, i) => {
          assert.deepEqual(events[0], { type: 'start', modelId: models[i].id });
          assert.equal(events.at(-1).type, 'done');
        });
      });
    }
  },
);

test(
  'real socket HTTP stream: disconnect before upstream headers aborts that upstream request',
  { timeout: 5000 },
  async (t) => {
    let markArrived!: () => void;
    let markClosed!: () => void;
    const arrived = new Promise<void>((resolve) => {
      markArrived = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      markClosed = resolve;
    });
    const upstream = await startUpstream((_req, res) => {
      res.on('close', markClosed);
      markArrived();
      // Deliberately no response headers: route has not hijacked yet.
    });
    t.after(() => upstream.close());
    const client = createAiProxyClient({
      llmBaseUrl: upstream.baseUrl,
      llmApiKey: 'fake',
      llmTimeoutMs: 3000,
    });
    const app = buildApp({ models: TEST_MODELS, streamGenerate: client.streamGenerate });
    t.after(async () => {
      app.server.closeAllConnections();
      await app.close();
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    t.after(() => controller.abort());
    const request = fetch(
      `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/api/stream`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'cancel before headers', modelId: 'test/free-model' }),
        signal: controller.signal,
      },
    );
    const rejected = assert.rejects(
      request,
      (err: unknown) => err instanceof Error && err.name === 'AbortError',
    );
    await arrived;
    controller.abort();
    await rejected;
    await closed;
  },
);
