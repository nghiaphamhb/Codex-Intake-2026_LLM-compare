import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const require = createRequire(import.meta.url);
const tsxLoaderUrl = pathToFileURL(require.resolve('tsx')).href;
const absoluteServerPath = resolve('src/server.ts');

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

async function waitForHealth(
  port: number,
  timeoutMs = 7000,
): Promise<{ status: number; body: unknown }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
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

test('startup exits with code 1 when required config is missing without leaking secrets', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'startup-test-missing-'));
  const fakeSecret = 'fake-secret-key-do-not-leak';
  let stderr = '';
  let stdout = '';

  try {
    const child = spawn(process.execPath, ['--import', tsxLoaderUrl, absoluteServerPath], {
      cwd: tempDir,
      env: getSanitizedEnv({
        LLM_BASE_URL: 'https://example.invalid',
        // LLM_API_KEY is intentionally missing
      }),
    });

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', resolve);
    });

    assert.equal(exitCode, 1);
    assert.match(stderr, /Invalid configuration: LLM_API_KEY/);
    assert.equal(stderr.includes(fakeSecret), false);
    assert.equal(stdout.includes(fakeSecret), false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('startup loads .env file and process.env overrides file values, serving health check', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'startup-test-env-'));
  const fileKey = 'file-key-secret-123';
  const envKey = 'env-key-secret-456';
  const targetPort = await getFreePort();
  const filePort = await getFreePort();

  // Write .env to tempDir with different values
  writeFileSync(
    join(tempDir, '.env'),
    `PORT=${filePort}\nLLM_BASE_URL=https://file.example.invalid\nLLM_API_KEY=${fileKey}\nLLM_TIMEOUT_MS=10000\n`,
  );

  let stdout = '';
  let stderr = '';
  let child: ReturnType<typeof spawn> | undefined;

  try {
    child = spawn(process.execPath, ['--import', tsxLoaderUrl, absoluteServerPath], {
      cwd: tempDir,
      env: getSanitizedEnv({
        PORT: String(targetPort), // process env must override filePort
        LLM_API_KEY: envKey, // process env must override fileKey
      }),
    });

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    const health = await waitForHealth(targetPort);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok' });

    // Verify secrets are never logged
    assert.equal(stdout.includes(fileKey), false);
    assert.equal(stdout.includes(envKey), false);
    assert.equal(stderr.includes(fileKey), false);
    assert.equal(stderr.includes(envKey), false);
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise((res) => child!.on('exit', res));
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});
