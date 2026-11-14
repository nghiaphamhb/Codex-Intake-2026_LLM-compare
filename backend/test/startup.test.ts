import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { startUpstream } from './helpers/upstream.js';

const require = createRequire(import.meta.url);
const tsxLoaderUrl = pathToFileURL(require.resolve('tsx')).href;
function createStartupFixture(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'backend'));
  cpSync(resolve('src'), join(root, 'backend/src'), { recursive: true });
  writeFileSync(join(root, 'backend/package.json'), '{"type":"module"}');
  symlinkSync(resolve('node_modules'), join(root, 'backend/node_modules'), 'junction');
  return root;
}

async function getFreePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      if (typeof address === 'object' && address !== null) {
        const port = address.port;
        srv.close(() => res(port));
      } else {
        srv.close(() => rej(new Error('Failed to obtain port')));
      }
    });
    srv.on('error', rej);
  });
}

function getSanitizedEnv(overrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('LLM_') || key === 'PORT') {
      delete env[key];
    }
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      delete env[k];
    } else {
      env[k] = v;
    }
  }
  return env;
}

function waitForExit(child: ChildProcess, timeoutMs = 7000): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      rejectPromise(new Error(`Child process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    const onExit = (code: number | null) => {
      clearTimeout(timer);
      resolvePromise(code);
    };
    child.once('exit', onExit);
  });
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill();
  try {
    await waitForExit(child, 3000);
  } catch {
    child.kill('SIGKILL');
    await waitForExit(child, 2000).catch(() => {});
  }
}

async function waitForHealth(
  port: number,
  child: ChildProcess,
  timeoutMs = 7000,
): Promise<{ status: number; body: unknown }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Child process exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = await res.json();
      return { status: res.status, body };
    } catch {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timeout waiting for health on port ${port}`);
}

test('startup exits with code 1 when required config is missing before calling upstream', async (t) => {
  const tempDir = createStartupFixture('startup-test-missing-');
  let upstreamCalls = 0;
  const stub = await startUpstream((_req, res) => {
    upstreamCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
  });
  t.after(() => stub.close());

  const fakeSecret = 'fake-secret-key-do-not-leak';
  let stderr = '';
  let stdout = '';
  let child: ChildProcess | undefined;

  try {
    child = spawn(
      process.execPath,
      ['--import', tsxLoaderUrl, join(tempDir, 'backend/src/server.ts')],
      {
        cwd: tempDir,
        env: getSanitizedEnv({
          LLM_BASE_URL: stub.baseUrl,
          // LLM_API_KEY is intentionally missing
        }),
      },
    );

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await waitForExit(child);

    assert.equal(exitCode, 1);
    assert.equal(upstreamCalls, 0);
    assert.match(stderr, /Invalid configuration: LLM_API_KEY/);
    assert.equal(stderr.includes(fakeSecret), false);
    assert.equal(stdout.includes(fakeSecret), false);
  } finally {
    await stopChild(child);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('startup loads root .env from backend cwd, overrides with process.env, serves catalog, and keeps logs clean', async (t) => {
  const tempDir = createStartupFixture('startup-test-env-');
  const fileKey = 'file-key-secret-123';
  const envKey = 'env-key-secret-456';
  const promptSentinel = 'PROMPT_SENTINEL_NEVER_LOG';
  const upstreamErrorSentinel = 'UPSTREAM_RAW_SECRET_DO_NOT_LOG';
  const targetPort = await getFreePort();
  const filePort = await getFreePort();

  let stubACalls = 0;
  const stubA = await startUpstream((_req, res) => {
    stubACalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
  });
  t.after(() => stubA.close());

  let stubBModelsCalls = 0;
  let stubBGenerateCalls = 0;
  let stubBApiKey: string | string[] | undefined;
  const stubB = await startUpstream((req, res) => {
    stubBApiKey = req.headers['x-api-key'];
    if (req.method === 'GET' && req.url === '/models') {
      stubBModelsCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }] }));
      return;
    }
    if (req.method === 'POST' && req.url === '/generate') {
      stubBGenerateCalls += 1;
      req.resume();
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: upstreamErrorSentinel }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stubB.close());

  writeFileSync(
    join(tempDir, '.env'),
    `PORT=${filePort}\nLLM_BASE_URL=${stubA.baseUrl}\nLLM_API_KEY=${fileKey}\nLLM_TIMEOUT_MS=10000\n`,
  );

  writeFileSync(join(tempDir, 'backend/.env'), 'LLM_TIMEOUT_MS=invalid\n');

  let stdout = '';
  let stderr = '';
  let child: ChildProcess | undefined;

  try {
    child = spawn(
      process.execPath,
      ['--import', tsxLoaderUrl, join(tempDir, 'backend/src/server.ts')],
      {
        cwd: join(tempDir, 'backend'),
        env: getSanitizedEnv({
          PORT: String(targetPort),
          LLM_BASE_URL: stubB.baseUrl,
          LLM_API_KEY: envKey,
        }),
      },
    );

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    const health = await waitForHealth(targetPort, child);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok' });

    const modelsRes = await fetch(`http://127.0.0.1:${targetPort}/api/models`);
    assert.equal(modelsRes.status, 200);
    assert.deepEqual(await modelsRes.json(), {
      models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', provider: 'OpenAI' }],
    });

    const genRes = await fetch(`http://127.0.0.1:${targetPort}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: promptSentinel, modelId: 'openai/gpt-5-mini' }),
    });
    assert.equal(genRes.status, 502);
    assert.deepEqual(await genRes.json(), {
      error: { code: 'UPSTREAM_ERROR', message: 'Model service request failed' },
    });

    const invalidPromptSentinel = 'INVALID_PROMPT_SENTINEL_NEVER_LOG';
    const invalidGenRes = await fetch(`http://127.0.0.1:${targetPort}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: invalidPromptSentinel, modelId: 'unknown/model' }),
    });
    assert.equal(invalidGenRes.status, 400);

    assert.equal(stubACalls, 0);
    assert.equal(stubBModelsCalls, 1);
    assert.equal(stubBGenerateCalls, 1);
    assert.equal(stubBApiKey, envKey);

    await stopChild(child);

    assert.match(stdout, /Server listening/);
    assert.match(stdout, /request completed/);

    for (const secret of [
      fileKey,
      envKey,
      promptSentinel,
      invalidPromptSentinel,
      upstreamErrorSentinel,
    ]) {
      assert.equal(stdout.includes(secret), false);
      assert.equal(stderr.includes(secret), false);
    }
  } finally {
    await stopChild(child);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('startup exits with code 1 and safe log when upstream catalog fails', async (t) => {
  const failureCases: ReadonlyArray<{
    name: string;
    expectedCode: string;
    timeoutMs?: string;
    handler: (res: import('node:http').ServerResponse) => void;
  }> = [
    {
      name: '401 auth error',
      expectedCode: 'UPSTREAM_AUTH_ERROR',
      handler: (res) => {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'RAW_AUTH_SECRET' }));
      },
    },
    {
      name: '403 forbidden',
      expectedCode: 'UPSTREAM_AUTH_ERROR',
      handler: (res) => {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'RAW_AUTH_SECRET' }));
      },
    },
    {
      name: '429 rate limit',
      expectedCode: 'UPSTREAM_LIMIT_EXCEEDED',
      handler: (res) => {
        res.writeHead(429, { 'content-type': 'text/plain' });
        res.end('rate limited');
      },
    },
    {
      name: 'timeout',
      expectedCode: 'UPSTREAM_TIMEOUT',
      timeoutMs: '200',
      handler: () => {
        // Never reply
      },
    },
    {
      name: 'malformed JSON',
      expectedCode: 'UPSTREAM_INVALID_RESPONSE',
      handler: (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{invalid');
      },
    },
    {
      name: 'invalid catalog schema',
      expectedCode: 'UPSTREAM_INVALID_RESPONSE',
      handler: (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [{ id: 'bad id', name: '' }] }));
      },
    },
  ];

  for (const testCase of failureCases) {
    await t.test(testCase.name, async () => {
      const tempDir = createStartupFixture('startup-test-fail-');
      const port = await getFreePort();
      const fakeKey = 'startup-fail-key-secret';
      const stub = await startUpstream((_req, res) => {
        testCase.handler(res);
      });

      let stdout = '';
      let stderr = '';
      let child: ChildProcess | undefined;
      try {
        child = spawn(
          process.execPath,
          ['--import', tsxLoaderUrl, join(tempDir, 'backend/src/server.ts')],
          {
            cwd: tempDir,
            env: getSanitizedEnv({
              PORT: String(port),
              LLM_BASE_URL: stub.baseUrl,
              LLM_API_KEY: fakeKey,
              LLM_TIMEOUT_MS: testCase.timeoutMs ?? '1500',
            }),
          },
        );
        child.stdout?.on('data', (d) => {
          stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
          stderr += d.toString();
        });

        const exitCode = await waitForExit(child);
        assert.equal(exitCode, 1);
        assert.match(stderr, new RegExp(`Failed to load model catalog: ${testCase.expectedCode}`));
        assert.equal(stdout.includes(fakeKey), false);
        assert.equal(stderr.includes(fakeKey), false);
        assert.equal(stderr.includes('RAW_AUTH_SECRET'), false);
      } finally {
        await stopChild(child);
        await stub.close();
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});

test('startup succeeds with empty catalog and rejects generation requests with 400 Unknown modelId', async (t) => {
  const tempDir = createStartupFixture('startup-test-empty-');
  const targetPort = await getFreePort();
  const stub = await startUpstream((req, res) => {
    if (req.method === 'GET' && req.url === '/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stub.close());

  let child: ChildProcess | undefined;
  try {
    child = spawn(
      process.execPath,
      ['--import', tsxLoaderUrl, join(tempDir, 'backend/src/server.ts')],
      {
        cwd: tempDir,
        env: getSanitizedEnv({
          PORT: String(targetPort),
          LLM_BASE_URL: stub.baseUrl,
          LLM_API_KEY: 'empty-catalog-key',
        }),
      },
    );

    const health = await waitForHealth(targetPort, child);
    assert.equal(health.status, 200);

    const modelsRes = await fetch(`http://127.0.0.1:${targetPort}/api/models`);
    assert.equal(modelsRes.status, 200);
    assert.deepEqual(await modelsRes.json(), { models: [] });

    const genRes = await fetch(`http://127.0.0.1:${targetPort}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello', modelId: 'openai/gpt-5-mini' }),
    });
    assert.equal(genRes.status, 400);
    assert.deepEqual(await genRes.json(), {
      error: { code: 'INVALID_REQUEST', message: 'Unknown modelId' },
    });
  } finally {
    await stopChild(child);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('startup loads catalog then exits with code 1 when port is already occupied', async (t) => {
  const tempDir = createStartupFixture('startup-test-busy-');
  const occupier = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    occupier.once('error', rejectListen);
    occupier.listen(0, '127.0.0.1', () => resolveListen());
  });
  t.after(
    () =>
      new Promise<void>((resolveClose) => {
        occupier.close(() => resolveClose());
      }),
  );

  const address = occupier.address();
  assert.ok(typeof address === 'object' && address !== null);
  const busyPort = address.port;

  let modelRequests = 0;
  const stub = await startUpstream((req, res) => {
    if (req.method === 'GET' && req.url === '/models') {
      modelRequests += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5', name: 'GPT-5' }] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stub.close());

  const fakeKey = 'busy-port-secret-key';
  let stdout = '';
  let stderr = '';
  let child: ChildProcess | undefined;

  try {
    child = spawn(
      process.execPath,
      ['--import', tsxLoaderUrl, join(tempDir, 'backend/src/server.ts')],
      {
        cwd: tempDir,
        env: getSanitizedEnv({
          PORT: String(busyPort),
          LLM_BASE_URL: stub.baseUrl,
          LLM_API_KEY: fakeKey,
        }),
      },
    );
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await waitForExit(child);
    assert.equal(exitCode, 1);
    assert.equal(modelRequests, 1);
    assert.equal(stdout.includes(fakeKey), false);
    assert.equal(stderr.includes(fakeKey), false);
  } finally {
    await stopChild(child);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

for (const cwd of ['.', 'backend']) {
  test('startup reads config exclusively from root .env with cwd ' + cwd, async (t) => {
    const tempDir = createStartupFixture('startup-test-root-');
    const port = await getFreePort();
    const stub = await startUpstream((req, res) => {
      assert.equal(req.headers['x-api-key'], 'root-file-test-key');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
    });
    t.after(() => stub.close());
    writeFileSync(
      join(tempDir, '.env'),
      'PORT=' + port + '\nLLM_BASE_URL=' + stub.baseUrl + '\nLLM_API_KEY=root-file-test-key\n',
    );
    let child: ChildProcess | undefined;
    try {
      child = spawn(
        process.execPath,
        ['--import', tsxLoaderUrl, join(tempDir, 'backend/src/server.ts')],
        {
          cwd: join(tempDir, cwd),
          env: getSanitizedEnv(),
        },
      );
      assert.equal((await waitForHealth(port, child)).status, 200);
    } finally {
      await stopChild(child);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
}
