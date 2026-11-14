import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { startUpstream } from './helpers/upstream.js';

const require = createRequire(import.meta.url);
const tsxLoaderUrl = pathToFileURL(require.resolve('tsx')).href;

function createSmokeFixture(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'backend'));
  cpSync(resolve('src'), join(root, 'backend/src'), { recursive: true });
  const scriptsSrc = resolve('scripts');
  if (existsSync(scriptsSrc)) {
    cpSync(scriptsSrc, join(root, 'backend/scripts'), { recursive: true });
  }
  writeFileSync(join(root, 'backend/package.json'), '{"type":"module"}');
  symlinkSync(resolve('node_modules'), join(root, 'backend/node_modules'), 'junction');
  return root;
}

function getSanitizedEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
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

function waitForClose(child: ChildProcess, timeoutMs = 10000): Promise<number | null> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      child.off('close', onClose);
      rejectPromise(new Error(`Child process did not close within ${timeoutMs}ms`));
    }, timeoutMs);
    const onClose = (code: number | null) => {
      clearTimeout(timer);
      resolvePromise(code);
    };
    child.once('close', onClose);
  });
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill();
  try {
    await waitForClose(child, 3000);
  } catch {
    child.kill('SIGKILL');
    await waitForClose(child, 2000).catch(() => {});
  }
}

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runSmokeCli(
  tempDir: string,
  args: string[] = [],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {},
): Promise<RunResult> {
  const scriptPath = join(tempDir, 'backend/scripts/smoke-proxy.ts');
  let child: ChildProcess | undefined;
  let stdout = '';
  let stderr = '';

  try {
    child = spawn(process.execPath, ['--import', tsxLoaderUrl, scriptPath, ...args], {
      cwd: options.cwd ?? tempDir,
      env: options.env ?? getSanitizedEnv(),
    });

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await waitForClose(child, options.timeoutMs ?? 10000);
    return { exitCode, stdout, stderr };
  } finally {
    await stopChild(child);
  }
}

test('smoke CLI default catalog mode sends one GET /models without body, zero POSTs, and prints expected JSON', async (t) => {
  const tempDir = createSmokeFixture('smoke-test-default-');
  let getModelsCalls = 0;
  let postCalls = 0;
  let capturedKey: string | string[] | undefined;
  let getBodyLength = 0;

  const stub = await startUpstream((req, res) => {
    capturedKey = req.headers['x-api-key'];
    if (req.method === 'GET' && req.url === '/models') {
      getModelsCalls += 1;
      req.on('data', (chunk) => {
        getBodyLength += chunk.length;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [
              {
                id: 'openai/gpt-5-mini',
                name: 'GPT-5 Mini',
                pricing: { prompt: '0.001', completion: '0.002' },
              },
            ],
          }),
        );
      });
      return;
    }
    if (req.method === 'POST') {
      postCalls += 1;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stub.close());

  const fakeKey = 'fake-catalog-key-secret';

  try {
    const result = await runSmokeCli(tempDir, [], {
      env: getSanitizedEnv({
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_KEY: fakeKey,
      }),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(getModelsCalls, 1);
    assert.equal(postCalls, 0);
    assert.equal(getBodyLength, 0);
    assert.equal(capturedKey, fakeKey);
    assert.equal(result.stderr.trim(), '');

    const parsedStdout = JSON.parse(result.stdout.trim());
    assert.deepEqual(parsedStdout, {
      ok: true,
      mode: 'catalog',
      modelCount: 1,
      health: 'ok',
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('smoke CLI rejects invalid args before network and exits 1 with SMOKE_INVALID_ARGS', async (t) => {
  const invalidArgCases: Array<{ name: string; args: string[] }> = [
    { name: 'only model', args: ['--model', 'openai/gpt-5-mini'] },
    { name: 'only generate', args: ['--generate'] },
    { name: 'missing ID', args: ['--generate', '--model'] },
    { name: 'empty ID', args: ['--generate', '--model', ''] },
    { name: 'whitespace ID', args: ['--generate', '--model', '   '] },
    { name: 'leading whitespace ID', args: ['--generate', '--model', ' openai/gpt-5-mini'] },
    { name: 'trailing whitespace ID', args: ['--generate', '--model', 'openai/gpt-5-mini '] },
    { name: 'strange flag', args: ['--foo'] },
    { name: 'extra flag', args: ['--generate', '--model', 'openai/gpt-5-mini', '--extra'] },
    { name: 'reversed flags', args: ['--model', 'openai/gpt-5-mini', '--generate'] },
    {
      name: 'repeated generate',
      args: ['--generate', '--generate', '--model', 'openai/gpt-5-mini'],
    },
  ];

  let httpCalls = 0;
  const stub = await startUpstream((_req, res) => {
    httpCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
  });
  t.after(() => stub.close());

  for (const c of invalidArgCases) {
    await t.test(c.name, async () => {
      const tempDir = createSmokeFixture('smoke-test-args-');
      try {
        const result = await runSmokeCli(tempDir, c.args, {
          env: getSanitizedEnv({
            LLM_BASE_URL: stub.baseUrl,
            LLM_API_KEY: 'test-key',
          }),
        });

        assert.equal(result.exitCode, 1);
        assert.equal(httpCalls, 0);
        assert.equal(result.stdout.trim(), '');
        assert.equal(
          result.stderr.trim(),
          JSON.stringify({ ok: false, code: 'SMOKE_INVALID_ARGS' }),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});

test('smoke CLI fails before network when required config is missing and returns SMOKE_CONFIG_INVALID', async (t) => {
  const tempDir = createSmokeFixture('smoke-test-config-');
  let httpCalls = 0;
  const stub = await startUpstream((_req, res) => {
    httpCalls += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ models: [] }));
  });
  t.after(() => stub.close());

  try {
    const result = await runSmokeCli(tempDir, [], {
      env: getSanitizedEnv({
        LLM_BASE_URL: stub.baseUrl,
        // LLM_API_KEY is missing
      }),
    });

    assert.equal(result.exitCode, 1);
    assert.equal(httpCalls, 0);
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.stderr.trim(), JSON.stringify({ ok: false, code: 'SMOKE_CONFIG_INVALID' }));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

for (const cwd of ['.', 'backend']) {
  test(`smoke CLI loads root .env with cwd ${cwd}, overrides with system env, and ignores backend/.env`, async (t) => {
    const tempDir = createSmokeFixture('smoke-test-env-');
    const fileKey = 'file-key-secret-123';
    const envKey = 'env-key-secret-456';

    let stubFileCalls = 0;
    const stubFile = await startUpstream((_req, res) => {
      stubFileCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
    });
    t.after(() => stubFile.close());

    let stubEnvCalls = 0;
    let stubEnvKey: string | string[] | undefined;
    const stubEnv = await startUpstream((req, res) => {
      stubEnvKey = req.headers['x-api-key'];
      if (req.method === 'GET' && req.url === '/models') {
        stubEnvCalls += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    t.after(() => stubEnv.close());

    writeFileSync(
      join(tempDir, '.env'),
      `LLM_BASE_URL=${stubFile.baseUrl}\nLLM_API_KEY=${fileKey}\nLLM_TIMEOUT_MS=10000\n`,
    );

    writeFileSync(
      join(tempDir, 'backend/.env'),
      'LLM_TIMEOUT_MS=invalid\nLLM_API_KEY=backend-env-key-invalid\n',
    );

    try {
      const result = await runSmokeCli(tempDir, [], {
        cwd: join(tempDir, cwd),
        env: getSanitizedEnv({
          LLM_BASE_URL: stubEnv.baseUrl,
          LLM_API_KEY: envKey,
        }),
      });

      assert.equal(result.exitCode, 0);
      assert.equal(stubFileCalls, 0);
      assert.equal(stubEnvCalls, 1);
      assert.equal(stubEnvKey, envKey);
      assert.equal(result.stderr.trim(), '');
      assert.deepEqual(JSON.parse(result.stdout.trim()), {
        ok: true,
        mode: 'catalog',
        modelCount: 1,
        health: 'ok',
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

test('smoke CLI generate mode performs single POST /generate with fixed prompt, ignores extra usage, and produces valid output', async (t) => {
  const tempDir = createSmokeFixture('smoke-test-gen-');
  const fakeKey = 'fake-gen-secret-key-123';
  const textSentinel = 'LLM_OUTPUT_SENTINEL_SECRET';
  let modelsCalls = 0;
  let generateCalls = 0;
  let capturedBody = '';
  let capturedKey: string | string[] | undefined;

  const stub = await startUpstream((req, res) => {
    capturedKey = req.headers['x-api-key'];
    if (req.method === 'GET' && req.url === '/models') {
      modelsCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }],
        }),
      );
      return;
    }
    if (req.method === 'POST' && req.url === '/generate') {
      generateCalls += 1;
      req.on('data', (d) => {
        capturedBody += d.toString();
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            text: `OK ${textSentinel}`,
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }),
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stub.close());

  try {
    const result = await runSmokeCli(tempDir, ['--generate', '--model', 'openai/gpt-5-mini'], {
      env: getSanitizedEnv({
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_KEY: fakeKey,
      }),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(modelsCalls, 1);
    assert.equal(generateCalls, 1);
    assert.equal(capturedKey, fakeKey);

    const parsedReqBody = JSON.parse(capturedBody);
    assert.deepEqual(parsedReqBody, {
      prompt: 'Reply with only: OK',
      model: 'openai/gpt-5-mini',
    });

    assert.equal(result.stderr.trim(), '');

    const parsedStdout = JSON.parse(result.stdout.trim());
    assert.equal(parsedStdout.ok, true);
    assert.equal(parsedStdout.mode, 'generate');
    assert.equal(parsedStdout.modelCount, 1);
    assert.equal(parsedStdout.health, 'ok');
    assert.equal(parsedStdout.modelId, 'openai/gpt-5-mini');
    assert.equal(typeof parsedStdout.durationMs, 'number');
    assert.equal(Number.isFinite(parsedStdout.durationMs), true);
    assert.equal(parsedStdout.durationMs >= 0, true);
    assert.equal(parsedStdout.textNonEmpty, true);

    // Ensure secrets and sentinels are never logged
    assert.equal(result.stdout.includes(fakeKey), false);
    assert.equal(result.stderr.includes(fakeKey), false);
    assert.equal(result.stdout.includes(textSentinel), false);
    assert.equal(result.stderr.includes(textSentinel), false);
    assert.equal(result.stdout.includes('Reply with only: OK'), false);
    assert.equal(result.stderr.includes('Reply with only: OK'), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('smoke CLI generate mode rejects empty catalog with SMOKE_EMPTY_CATALOG and 0 POSTs', async (t) => {
  const tempDir = createSmokeFixture('smoke-test-gen-empty-');
  let modelsCalls = 0;
  let generateCalls = 0;

  const stub = await startUpstream((req, res) => {
    if (req.method === 'GET' && req.url === '/models') {
      modelsCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    if (req.method === 'POST') {
      generateCalls += 1;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stub.close());

  try {
    const result = await runSmokeCli(tempDir, ['--generate', '--model', 'openai/gpt-5-mini'], {
      env: getSanitizedEnv({
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_KEY: 'test-key',
      }),
    });

    assert.equal(result.exitCode, 1);
    assert.equal(modelsCalls, 1);
    assert.equal(generateCalls, 0);
    assert.equal(result.stdout.trim(), '');
    assert.equal(result.stderr.trim(), JSON.stringify({ ok: false, code: 'SMOKE_EMPTY_CATALOG' }));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('smoke CLI generate mode rejects unknown model with SMOKE_MODEL_NOT_FOUND and 0 POSTs', async (t) => {
  const tempDir = createSmokeFixture('smoke-test-gen-unknown-');
  let modelsCalls = 0;
  let generateCalls = 0;

  const stub = await startUpstream((req, res) => {
    if (req.method === 'GET' && req.url === '/models') {
      modelsCalls += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ models: [{ id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' }] }),
      );
      return;
    }
    if (req.method === 'POST') {
      generateCalls += 1;
    }
    res.writeHead(404);
    res.end();
  });
  t.after(() => stub.close());

  try {
    const result = await runSmokeCli(tempDir, ['--generate', '--model', 'openai/gpt-5-mini'], {
      env: getSanitizedEnv({
        LLM_BASE_URL: stub.baseUrl,
        LLM_API_KEY: 'test-key',
      }),
    });

    assert.equal(result.exitCode, 1);
    assert.equal(modelsCalls, 1);
    assert.equal(generateCalls, 0);
    assert.equal(result.stdout.trim(), '');
    assert.equal(
      result.stderr.trim(),
      JSON.stringify({ ok: false, code: 'SMOKE_MODEL_NOT_FOUND' }),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('smoke CLI generate mode rejects empty or whitespace-only text with SMOKE_EMPTY_TEXT', async (t) => {
  const emptyCases = [
    { name: 'empty string', text: '' },
    { name: 'whitespace only', text: '   \n\t  ' },
  ];

  for (const c of emptyCases) {
    await t.test(c.name, async () => {
      const tempDir = createSmokeFixture('smoke-test-gen-blank-');
      const stub = await startUpstream((req, res) => {
        if (req.method === 'GET' && req.url === '/models') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }] }));
          return;
        }
        if (req.method === 'POST' && req.url === '/generate') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ text: c.text }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      try {
        const result = await runSmokeCli(tempDir, ['--generate', '--model', 'openai/gpt-5-mini'], {
          env: getSanitizedEnv({
            LLM_BASE_URL: stub.baseUrl,
            LLM_API_KEY: 'test-key',
          }),
        });

        assert.equal(result.exitCode, 1);
        assert.equal(result.stdout.trim(), '');
        assert.equal(result.stderr.trim(), JSON.stringify({ ok: false, code: 'SMOKE_EMPTY_TEXT' }));
      } finally {
        await stub.close();
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});

test('smoke CLI generate mode maps upstream invalid response payload to UPSTREAM_INVALID_RESPONSE', async (t) => {
  const invalidPayloadCases = [
    { name: 'text is null', body: JSON.stringify({ text: null }) },
    { name: 'missing text', body: JSON.stringify({ other: 'value' }) },
  ];

  for (const c of invalidPayloadCases) {
    await t.test(c.name, async () => {
      const tempDir = createSmokeFixture('smoke-test-gen-invpayload-');
      const stub = await startUpstream((req, res) => {
        if (req.method === 'GET' && req.url === '/models') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }] }));
          return;
        }
        if (req.method === 'POST' && req.url === '/generate') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(c.body);
          return;
        }
        res.writeHead(404);
        res.end();
      });

      try {
        const result = await runSmokeCli(tempDir, ['--generate', '--model', 'openai/gpt-5-mini'], {
          env: getSanitizedEnv({
            LLM_BASE_URL: stub.baseUrl,
            LLM_API_KEY: 'test-key',
          }),
        });

        assert.equal(result.exitCode, 1);
        assert.equal(result.stdout.trim(), '');
        assert.equal(
          result.stderr.trim(),
          JSON.stringify({ ok: false, code: 'UPSTREAM_INVALID_RESPONSE' }),
        );
      } finally {
        await stub.close();
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});

test('smoke CLI failure matrix maps upstream errors on catalog and generate without retry or leaking sentinels', async (t) => {
  const sentinelSecret = 'UPSTREAM_RAW_SECRET_LEAK_12345';
  const stackLeak = 'STACK_TRACE_SENTINEL_LEAK_XYZ';

  const failureScenarios: Array<{
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
        res.end(JSON.stringify({ error: sentinelSecret, stack: stackLeak }));
      },
    },
    {
      name: '403 forbidden',
      expectedCode: 'UPSTREAM_AUTH_ERROR',
      handler: (res) => {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: sentinelSecret }));
      },
    },
    {
      name: '429 rate limit',
      expectedCode: 'UPSTREAM_LIMIT_EXCEEDED',
      handler: (res) => {
        res.writeHead(429, { 'content-type': 'text/plain' });
        res.end(`Too many requests: ${sentinelSecret}`);
      },
    },
    {
      name: '500 internal server error',
      expectedCode: 'UPSTREAM_ERROR',
      handler: (res) => {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: sentinelSecret }));
      },
    },
    {
      name: '200 malformed JSON',
      expectedCode: 'UPSTREAM_INVALID_RESPONSE',
      handler: (res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(`{ malformed json ${sentinelSecret}`);
      },
    },
    {
      name: 'timeout',
      expectedCode: 'UPSTREAM_TIMEOUT',
      timeoutMs: '200',
      handler: () => {
        // do not respond
      },
    },
  ];

  for (const scenario of failureScenarios) {
    // 1. Test failing on GET /models (catalog mode)
    await t.test(`catalog mode: ${scenario.name}`, async () => {
      const tempDir = createSmokeFixture('smoke-fail-cat-');
      let calls = 0;
      const stub = await startUpstream((req, res) => {
        if (req.method === 'GET' && req.url === '/models') {
          calls += 1;
          scenario.handler(res);
          return;
        }
        res.writeHead(404);
        res.end();
      });

      try {
        const result = await runSmokeCli(tempDir, [], {
          env: getSanitizedEnv({
            LLM_BASE_URL: stub.baseUrl,
            LLM_API_KEY: 'test-key',
            LLM_TIMEOUT_MS: scenario.timeoutMs ?? '1500',
          }),
        });

        assert.equal(result.exitCode, 1);
        assert.equal(calls, 1); // No retry
        assert.equal(result.stdout.trim(), '');
        assert.equal(
          result.stderr.trim(),
          JSON.stringify({ ok: false, code: scenario.expectedCode }),
        );
        assert.equal(result.stdout.includes(sentinelSecret), false);
        assert.equal(result.stderr.includes(sentinelSecret), false);
        assert.equal(result.stdout.includes(stackLeak), false);
        assert.equal(result.stderr.includes(stackLeak), false);
      } finally {
        await stub.close();
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    // 2. Test failing on POST /generate (generate mode)
    await t.test(`generate mode: ${scenario.name}`, async () => {
      const tempDir = createSmokeFixture('smoke-fail-gen-');
      let modelsCalls = 0;
      let generateCalls = 0;
      const stub = await startUpstream((req, res) => {
        if (req.method === 'GET' && req.url === '/models') {
          modelsCalls += 1;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ models: [{ id: 'openai/gpt-5-mini', name: 'GPT-5 Mini' }] }));
          return;
        }
        if (req.method === 'POST' && req.url === '/generate') {
          generateCalls += 1;
          scenario.handler(res);
          return;
        }
        res.writeHead(404);
        res.end();
      });

      try {
        const result = await runSmokeCli(tempDir, ['--generate', '--model', 'openai/gpt-5-mini'], {
          env: getSanitizedEnv({
            LLM_BASE_URL: stub.baseUrl,
            LLM_API_KEY: 'test-key',
            LLM_TIMEOUT_MS: scenario.timeoutMs ?? '1500',
          }),
        });

        assert.equal(result.exitCode, 1);
        assert.equal(modelsCalls, 1);
        assert.equal(generateCalls, 1); // No retry
        assert.equal(result.stdout.trim(), '');
        assert.equal(
          result.stderr.trim(),
          JSON.stringify({ ok: false, code: scenario.expectedCode }),
        );
        assert.equal(result.stdout.includes(sentinelSecret), false);
        assert.equal(result.stderr.includes(sentinelSecret), false);
        assert.equal(result.stdout.includes(stackLeak), false);
        assert.equal(result.stderr.includes(stackLeak), false);
      } finally {
        await stub.close();
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});

for (const cwd of ['.', 'backend']) {
  test('smoke CLI reads root env without system config with cwd ' + cwd, async () => {
    const tempDir = createSmokeFixture('smoke-root-only-');
    let calls = 0;
    const stub = await startUpstream((req, res) => {
      calls++;
      assert.equal(req.headers['x-api-key'], 'root-only-test-key');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ models: [{ id: 'test/model', name: 'Test' }] }));
    });
    try {
      writeFileSync(
        join(tempDir, '.env'),
        'LLM_BASE_URL=' + stub.baseUrl + '\nLLM_API_KEY=root-only-test-key\n',
      );
      writeFileSync(join(tempDir, 'backend/.env'), 'LLM_TIMEOUT_MS=invalid\n');
      const result = await runSmokeCli(tempDir, [], {
        cwd: join(tempDir, cwd),
        env: getSanitizedEnv(),
      });
      assert.equal(result.exitCode, 0);
      assert.equal(calls, 1);
      assert.equal(result.stderr, '');
      assert.deepEqual(JSON.parse(result.stdout), {
        ok: true,
        mode: 'catalog',
        modelCount: 1,
        health: 'ok',
      });
    } finally {
      await stub.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

test('smoke CLI rejects internal response contract drift', async (t) => {
  const cases = [
    {
      name: 'health extra field',
      url: '/api/health',
      change: 'body.extra = true;',
      code: 'SMOKE_API_CONTRACT_FAILED',
    },
    {
      name: 'catalog extra field',
      url: '/api/models',
      change: 'body.default = "test/model";',
      code: 'SMOKE_API_CONTRACT_FAILED',
    },
    {
      name: 'model extra field',
      url: '/api/models',
      change: 'body.models[0].pricing = {};',
      code: 'SMOKE_API_CONTRACT_FAILED',
    },
    {
      name: 'generation extra field',
      url: '/api/generate',
      change: 'body.usage = {};',
      code: 'SMOKE_API_CONTRACT_FAILED',
    },
    {
      name: 'unexpected inject error',
      url: '/api/generate',
      change: 'reply.code(500); body = { error: { code: "SECRET_UNKNOWN_CODE" } };',
      code: 'SMOKE_FAILED',
    },
  ];
  for (const c of cases) {
    await t.test(c.name, async () => {
      const tempDir = createSmokeFixture('smoke-contract-drift-');
      let posts = 0;
      const stub = await startUpstream((req, res) => {
        if (req.method === 'POST') posts++;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify(
            req.method === 'POST'
              ? { text: 'SAFE_TEXT' }
              : { models: [{ id: 'test/model', name: 'Test' }] },
          ),
        );
      });
      try {
        // Fault injection only in the copied fixture: production source remains untouched.
        const appPath = join(tempDir, 'backend/src/app.ts');
        const hook =
          'app.addHook("onSend", (req, reply, payload, done) => { if (req.url === ' +
          JSON.stringify(c.url) +
          ') { let body = JSON.parse(String(payload)); ' +
          c.change +
          ' done(null, JSON.stringify(body)); } else { done(null, payload); } }); return app;';
        writeFileSync(appPath, readFileSync(appPath, 'utf8').replace('return app;', hook));
        const result = await runSmokeCli(tempDir, ['--generate', '--model', 'test/model'], {
          env: getSanitizedEnv({ LLM_BASE_URL: stub.baseUrl, LLM_API_KEY: 'contract-test-key' }),
        });
        assert.equal(result.exitCode, 1);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, JSON.stringify({ ok: false, code: c.code }) + '\n');
        assert.equal(posts, c.url === '/api/generate' ? 1 : 0);
      } finally {
        await stub.close();
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
});

test('smoke CLI reports unreadable root env without leaking details', async () => {
  const tempDir = createSmokeFixture('smoke-env-unreadable-');
  try {
    mkdirSync(join(tempDir, '.env'));
    const result = await runSmokeCli(tempDir);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, '');
    assert.equal(
      result.stderr,
      JSON.stringify({ ok: false, code: 'SMOKE_ENV_LOAD_FAILED' }) + '\n',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
