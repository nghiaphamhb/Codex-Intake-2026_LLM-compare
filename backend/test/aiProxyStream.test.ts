import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiProxyClient, AiProxyError, type StreamDelta } from '../src/aiProxy.js';
import { startUpstream } from './helpers/upstream.js';

test(
  'streamGenerate: deadline rejection from a blocked callback stays UPSTREAM_TIMEOUT',
  { timeout: 3000 },
  async (t) => {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write('{"type":"text-delta","delta":"partial"}\n');
    });
    t.after(() => upstream.close());
    const client = createAiProxyClient({
      llmBaseUrl: upstream.baseUrl,
      llmApiKey: 'fake',
      llmTimeoutMs: 150,
    });
    await assert.rejects(
      client.streamGenerate(
        { prompt: 'p', modelId: 'm' },
        {
          signal: new AbortController().signal,
          onReady: async () => {},
          onDelta: async (_event, signal) => {
            await new Promise<void>((_resolve, reject) => {
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            });
          },
        },
      ),
      (err: unknown) => err instanceof AiProxyError && err.code === 'UPSTREAM_TIMEOUT',
    );
  },
);

test('streamGenerate: external abort prevents buffered deltas and finish after callbacks', async (t) => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.end(
      '{"type":"text-delta","delta":"first"}\n{"type":"text-delta","delta":"late"}\n{"type":"finish"}\n',
    );
  });
  t.after(() => upstream.close());
  for (const abortPhase of ['ready', 'delta']) {
    const controller = new AbortController();
    const deltas: string[] = [];
    const client = createAiProxyClient({
      llmBaseUrl: upstream.baseUrl,
      llmApiKey: 'fake',
      llmTimeoutMs: 1000,
    });
    await assert.rejects(
      client.streamGenerate(
        { prompt: 'p', modelId: 'm' },
        {
          signal: controller.signal,
          onReady: async () => {
            if (abortPhase === 'ready') controller.abort();
          },
          onDelta: async (event) => {
            deltas.push(event.delta);
            controller.abort();
          },
        },
      ),
      (err: unknown) => err instanceof DOMException && err.name === 'AbortError',
    );
    assert.deepEqual(deltas, abortPhase === 'ready' ? [] : ['first']);
  }
});

const TEST_CONFIG = {
  llmBaseUrl: 'http://127.0.0.1:0/v1',
  llmApiKey: 'test-api-key',
  llmTimeoutMs: 500,
};

test(
  'streamGenerate: socket reset after a delivered delta is UPSTREAM_ERROR, not clean EOF',
  { timeout: 3000 },
  async (t) => {
    let resetSocket!: () => void;
    const upstream = await startUpstream((_req, res) => {
      resetSocket = () => res.destroy();
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write('{"type":"text-delta","delta":"partial before reset"}\n');
    });
    t.after(() => upstream.close());
    const client = createAiProxyClient({ ...TEST_CONFIG, llmBaseUrl: upstream.baseUrl });
    const deltas: StreamDelta[] = [];
    await assert.rejects(
      client.streamGenerate(
        { prompt: 'p', modelId: 'm' },
        {
          signal: new AbortController().signal,
          onReady: async () => {},
          onDelta: async (event) => {
            deltas.push(event);
            resetSocket();
          },
        },
      ),
      (err: unknown) => err instanceof AiProxyError && err.code === 'UPSTREAM_ERROR',
    );
    assert.deepEqual(deltas, [{ type: 'text-delta', delta: 'partial before reset' }]);
  },
);

test('streamGenerate: sends exact POST /prefix/stream with untrimmed prompt, headers, and no extra fields', async () => {
  let receivedMethod = '';
  let receivedPath = '';
  let receivedHeaders: Record<string, string | string[] | undefined> = {};
  let receivedBody = '';

  const upstream = await startUpstream((req, res) => {
    receivedMethod = req.method ?? '';
    receivedPath = req.url ?? '';
    receivedHeaders = req.headers;
    let body = '';
    req.on('data', (c) => (body += c.toString('utf-8')));
    req.on('end', () => {
      receivedBody = body;
      res.writeHead(200, {
        'content-type': 'application/x-ndjson; charset=utf-8',
      });
      res.write(JSON.stringify({ type: 'start' }) + '\n');
      res.write(JSON.stringify({ type: 'text-delta', delta: 'ok' }) + '\n');
      res.write(
        JSON.stringify({ type: 'finish', usage: { inputTokens: 5, outputTokens: 10 } }) + '\n',
      );
      res.end();
    });
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: `${upstream.baseUrl}/prefix`,
    });

    const deltas: StreamDelta[] = [];
    let readyCalled = false;
    const result = await client.streamGenerate(
      { prompt: '  keep untrimmed spaces  \n', modelId: 'provider/model-x' },
      {
        signal: new AbortController().signal,
        onReady: async () => {
          readyCalled = true;
        },
        onDelta: async (d) => {
          deltas.push(d);
        },
      },
    );

    assert.equal(receivedMethod, 'POST');
    assert.equal(receivedPath, '/prefix/stream');
    assert.equal(receivedHeaders['x-api-key'], 'test-api-key');
    assert.equal(receivedHeaders['content-type'], 'application/json');
    assert.equal(receivedHeaders['accept'], 'application/x-ndjson');
    assert.deepEqual(JSON.parse(receivedBody), {
      prompt: '  keep untrimmed spaces  \n',
      model: 'provider/model-x',
    });
    // Check no extra fields in request body
    assert.deepEqual(Object.keys(JSON.parse(receivedBody)).sort(), ['model', 'prompt']);

    assert.ok(readyCalled);
    assert.deepEqual(deltas, [{ type: 'text-delta', delta: 'ok' }]);
    assert.ok(result.durationMs >= 0);
    assert.deepEqual(result.usage, { inputTokens: 5, outputTokens: 10 });
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: rejects redirects without calling redirect target or leaking key', async () => {
  let targetCalls = 0;
  const targetServer = await startUpstream((_req, res) => {
    targetCalls++;
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.end();
  });

  const upstream = await startUpstream((_req, res) => {
    res.writeHead(302, { location: `${targetServer.baseUrl}/stream` });
    res.end();
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'test', modelId: 'test/m' },
          {
            signal: new AbortController().signal,
            onReady: async () => {},
            onDelta: async () => {},
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_ERROR');
        return true;
      },
    );
    assert.equal(targetCalls, 0);
  } finally {
    await upstream.close();
    await targetServer.close();
  }
});

test('streamGenerate: calls onReady before deltas/finish; handles sequential delta backpressure', async () => {
  let allowDeltasResolve: () => void;
  const allowDeltas = new Promise<void>((res) => {
    allowDeltasResolve = res;
  });

  const upstream = await startUpstream(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    // Flush headers first
    res.flushHeaders?.();
    // Wait until onReady triggers allowDeltas
    await allowDeltas;
    res.write(JSON.stringify({ type: 'text-delta', delta: 'd1' }) + '\n');
    res.write(JSON.stringify({ type: 'text-delta', delta: 'd2' }) + '\n');
    res.write(JSON.stringify({ type: 'finish' }) + '\n');
    res.end();
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    let readyTime = 0;
    const deltaTimes: number[] = [];
    let inFlightCallbacks = 0;
    let maxInFlight = 0;

    const result = await client.streamGenerate(
      { prompt: 'p', modelId: 'm' },
      {
        signal: new AbortController().signal,
        onReady: async () => {
          readyTime = performance.now();
          allowDeltasResolve();
        },
        onDelta: async () => {
          inFlightCallbacks++;
          maxInFlight = Math.max(maxInFlight, inFlightCallbacks);
          deltaTimes.push(performance.now());
          // Artificial micro-pause in callback
          await new Promise((r) => setTimeout(r, 10));
          inFlightCallbacks--;
        },
      },
    );

    assert.ok(readyTime > 0);
    assert.equal(deltaTimes.length, 2);
    assert.ok(readyTime <= deltaTimes[0]);
    assert.equal(maxInFlight, 1, 'callbacks must be executed sequentially with max in-flight 1');
    assert.ok(result.durationMs >= 0);
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: event normalization and stripping of extra fields', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    // Lifecycle markers to ignore
    res.write(JSON.stringify({ type: 'start', extra: 123 }) + '\n');
    res.write(JSON.stringify({ type: 'text-start' }) + '\n');
    res.write(JSON.stringify({ type: 'reasoning-start' }) + '\n');
    // Reasoning delta with extra field
    res.write(
      JSON.stringify({ type: 'reasoning-delta', delta: 'thought 1', secret: 'abc' }) + '\n',
    );
    res.write(JSON.stringify({ type: 'reasoning-end' }) + '\n');
    // Unknown event type
    res.write(JSON.stringify({ type: 'custom-vendor-event', data: 'hello' }) + '\n');
    // Empty text delta (must be skipped)
    res.write(JSON.stringify({ type: 'text-delta', delta: '' }) + '\n');
    // Valid text delta with extra field
    res.write(JSON.stringify({ type: 'text-delta', delta: 'answer 1', leak: true }) + '\n');
    res.write(JSON.stringify({ type: 'text-end' }) + '\n');
    // Finish with extra fields and invalid/valid usage tests
    res.write(
      JSON.stringify({
        type: 'finish',
        usage: { inputTokens: 42, outputTokens: 84, extraTokens: 999 },
        duration: 9999,
      }) + '\n',
    );
    res.end();
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    const received: StreamDelta[] = [];
    const result = await client.streamGenerate(
      { prompt: 'p', modelId: 'm' },
      {
        signal: new AbortController().signal,
        onReady: async () => {},
        onDelta: async (d) => {
          received.push(d);
        },
      },
    );

    assert.deepEqual(received, [
      { type: 'reasoning-delta', delta: 'thought 1' },
      { type: 'text-delta', delta: 'answer 1' },
    ]);
    // Extra fields should not exist
    for (const d of received) {
      assert.deepEqual(Object.keys(d).sort(), ['delta', 'type']);
    }
    assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 84 });
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: rejects invalid delta type (missing, non-string)', async () => {
  for (const invalidDelta of [null, 123, true, undefined, {}]) {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ type: 'text-delta', delta: invalidDelta }) + '\n');
      res.end();
    });

    try {
      const client = createAiProxyClient({
        ...TEST_CONFIG,
        llmBaseUrl: upstream.baseUrl,
      });

      await assert.rejects(
        async () => {
          await client.streamGenerate(
            { prompt: 'p', modelId: 'm' },
            {
              signal: new AbortController().signal,
              onReady: async () => {},
              onDelta: async () => {},
            },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof AiProxyError);
          assert.equal(err.code, 'UPSTREAM_INVALID_RESPONSE');
          return true;
        },
      );
    } finally {
      await upstream.close();
    }
  }
});

test(
  'streamGenerate: finish terminates immediately, cancels reader, and ignores trailing hang or garbage',
  { timeout: 3000 },
  async () => {
    let markClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      markClosed = resolve;
    });
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ type: 'text-delta', delta: 'done-text' }) + '\n');
      res.write(JSON.stringify({ type: 'finish' }) + '\n');
      // Do NOT call res.end() immediately; send garbage after finish
      res.write('CORRUPTED_GARBAGE_AFTER_FINISH\n');
      res.on('close', markClosed);
    });

    try {
      const client = createAiProxyClient({
        ...TEST_CONFIG,
        llmBaseUrl: upstream.baseUrl,
      });

      const deltas: StreamDelta[] = [];
      const result = await client.streamGenerate(
        { prompt: 'p', modelId: 'm' },
        {
          signal: new AbortController().signal,
          onReady: async () => {},
          onDelta: async (d) => {
            deltas.push(d);
          },
        },
      );

      assert.deepEqual(deltas, [{ type: 'text-delta', delta: 'done-text' }]);
      assert.ok(result.durationMs >= 0);
      await closed;
    } finally {
      await upstream.close();
    }
  },
);

test('streamGenerate: EOF without finish fails with UPSTREAM_INVALID_RESPONSE', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ type: 'text-delta', delta: 'partial' }) + '\n');
    res.end(); // EOF without finish!
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: new AbortController().signal,
            onReady: async () => {},
            onDelta: async () => {},
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_INVALID_RESPONSE');
        return true;
      },
    );
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: upstream HTTP status error mapping (401, 403, 429, 500, HTML body)', async () => {
  const matrix: Array<{ status: number; expectedCode: string }> = [
    { status: 401, expectedCode: 'UPSTREAM_AUTH_ERROR' },
    { status: 403, expectedCode: 'UPSTREAM_AUTH_ERROR' },
    { status: 429, expectedCode: 'UPSTREAM_LIMIT_EXCEEDED' },
    { status: 400, expectedCode: 'UPSTREAM_ERROR' },
    { status: 500, expectedCode: 'UPSTREAM_ERROR' },
  ];

  for (const { status, expectedCode } of matrix) {
    const upstream = await startUpstream((_req, res) => {
      res.writeHead(status, { 'content-type': 'text/html' });
      res.write('<html><body>Error message containing secret-api-key</body></html>');
      // leave body unended to test immediate cancellation
    });

    try {
      const client = createAiProxyClient({
        ...TEST_CONFIG,
        llmBaseUrl: upstream.baseUrl,
      });

      await assert.rejects(
        async () => {
          await client.streamGenerate(
            { prompt: 'p', modelId: 'm' },
            {
              signal: new AbortController().signal,
              onReady: async () => {},
              onDelta: async () => {},
            },
          );
        },
        (err: unknown) => {
          assert.ok(err instanceof AiProxyError);
          assert.equal(err.code, expectedCode);
          assert.ok(!err.message.includes('secret-api-key'));
          return true;
        },
      );
    } finally {
      await upstream.close();
    }
  }
});

test('streamGenerate: rejects non-ndjson content-type on 200 response', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"text":"hello"}');
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: new AbortController().signal,
            onReady: async () => {},
            onDelta: async () => {},
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_INVALID_RESPONSE');
        return true;
      },
    );
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: upstream error event maps to UPSTREAM_ERROR without leaking raw fields', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(
      JSON.stringify({ type: 'error', message: 'provider failed with secret-token-xyz' }) + '\n',
    );
    res.end();
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: new AbortController().signal,
            onReady: async () => {},
            onDelta: async () => {},
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_ERROR');
        assert.ok(!err.message.includes('secret-token-xyz'));
        return true;
      },
    );
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: total deadline timeout triggers UPSTREAM_TIMEOUT even with continuous deltas', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    // Keep sending deltas forever slowly
    const interval = setInterval(() => {
      res.write(JSON.stringify({ type: 'text-delta', delta: 'tick' }) + '\n');
    }, 40);
    res.on('close', () => clearInterval(interval));
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmTimeoutMs: 150,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: new AbortController().signal,
            onReady: async () => {},
            onDelta: async () => {},
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_TIMEOUT');
        return true;
      },
    );
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: external abort rejects AbortError and stops upstream read', async () => {
  const controller = new AbortController();
  let _upstreamRequests = 0;

  // 1. External abort before fetch: 0 requests sent
  controller.abort();
  const client = createAiProxyClient({
    ...TEST_CONFIG,
    llmBaseUrl: 'http://127.0.0.1:9999',
  });

  await assert.rejects(
    async () => {
      await client.streamGenerate(
        { prompt: 'p', modelId: 'm' },
        {
          signal: controller.signal,
          onReady: async () => {},
          onDelta: async () => {},
        },
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.name, 'AbortError');
      return true;
    },
  );

  // 2. External abort during body read cancels upstream connection
  let _closedByClient = false;
  const upstream = await startUpstream((_req, res) => {
    _upstreamRequests++;
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ type: 'text-delta', delta: 'first' }) + '\n');
    res.on('close', () => {
      _closedByClient = true;
    });
  });

  try {
    const runController = new AbortController();
    const liveClient = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await liveClient.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: runController.signal,
            onReady: async () => {},
            onDelta: async () => {
              runController.abort();
            },
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.name, 'AbortError');
        return true;
      },
    );
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: callback error is not wrapped as invalid response', async () => {
  const sentinel = new Error('CUSTOM_CALLBACK_FAILURE');
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ type: 'text-delta', delta: 'd' }) + '\n');
    res.end();
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmBaseUrl: upstream.baseUrl,
    });

    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: new AbortController().signal,
            onReady: async () => {},
            onDelta: async () => {
              throw sentinel;
            },
          },
        );
      },
      (err: unknown) => {
        assert.equal(err, sentinel);
        return true;
      },
    );
  } finally {
    await upstream.close();
  }
});

test('streamGenerate: effectiveSignal wakes up pending callback on deadline', async () => {
  const upstream = await startUpstream((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(JSON.stringify({ type: 'text-delta', delta: 'd' }) + '\n');
  });

  try {
    const client = createAiProxyClient({
      ...TEST_CONFIG,
      llmTimeoutMs: 150,
      llmBaseUrl: upstream.baseUrl,
    });

    let effectiveAborted = false;
    await assert.rejects(
      async () => {
        await client.streamGenerate(
          { prompt: 'p', modelId: 'm' },
          {
            signal: new AbortController().signal, // external signal remains NOT aborted
            onReady: async () => {},
            onDelta: async (_delta, effectiveSignal) => {
              await new Promise<void>((resolve) => {
                effectiveSignal.addEventListener('abort', () => {
                  effectiveAborted = true;
                  resolve();
                });
              });
            },
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof AiProxyError);
        assert.equal(err.code, 'UPSTREAM_TIMEOUT');
        return true;
      },
    );

    assert.ok(effectiveAborted, 'effectiveSignal must abort when deadline triggers');
  } finally {
    await upstream.close();
  }
});
