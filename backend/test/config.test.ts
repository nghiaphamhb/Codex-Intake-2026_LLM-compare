import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.js';

const VALID_BASE_ENV = {
  LLM_BASE_URL: 'https://example.test',
  LLM_API_KEY: 'test-secret-do-not-log'
};

test('readConfig returns valid config with defaults and does not leak extra env vars', () => {
  const config = readConfig({
    ...VALID_BASE_ENV,
    EXTRA_SECRET_VAR: 'should-not-exist-in-config'
  });

  assert.deepEqual(config, {
    port: 3000,
    llmBaseUrl: 'https://example.test',
    llmApiKey: 'test-secret-do-not-log',
    llmTimeoutMs: 60000
  });

  assert.deepEqual(Object.keys(config).sort(), ['llmApiKey', 'llmBaseUrl', 'llmTimeoutMs', 'port']);
});

test('readConfig handles valid overrides and trims whitespace', () => {
  const config = readConfig({
    PORT: '  8080  ',
    LLM_BASE_URL: '  https://example.test/v1/api/  ',
    LLM_API_KEY: '  my-clean-key  ',
    LLM_TIMEOUT_MS: '  30000  '
  });

  assert.deepEqual(config, {
    port: 8080,
    llmBaseUrl: 'https://example.test/v1/api',
    llmApiKey: 'my-clean-key',
    llmTimeoutMs: 30000
  });
});

test('readConfig preserves URL path prefix and strips trailing slashes', () => {
  const c1 = readConfig({ ...VALID_BASE_ENV, LLM_BASE_URL: 'https://example.test/custom/prefix' });
  assert.equal(c1.llmBaseUrl, 'https://example.test/custom/prefix');

  const c2 = readConfig({ ...VALID_BASE_ENV, LLM_BASE_URL: 'https://example.test/custom/prefix/' });
  assert.equal(c2.llmBaseUrl, 'https://example.test/custom/prefix');

  const c3 = readConfig({ ...VALID_BASE_ENV, LLM_BASE_URL: 'http://example.test:8080' });
  assert.equal(c3.llmBaseUrl, 'http://example.test:8080');
});

test('readConfig validates PORT correctly', () => {
  const validCases = [
    { input: '1', expected: 1 },
    { input: '65535', expected: 65535 },
    { input: '3000', expected: 3000 }
  ];
  for (const { input, expected } of validCases) {
    const config = readConfig({ ...VALID_BASE_ENV, PORT: input });
    assert.equal(config.port, expected);
  }

  const invalidCases = ['0', '65536', '-1', '1.5', '1e3', 'abc', '', '   '];
  for (const invalid of invalidCases) {
    assert.throws(
      () => readConfig({ ...VALID_BASE_ENV, PORT: invalid }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'Invalid configuration: PORT');
        return true;
      }
    );
  }
});

test('readConfig validates LLM_TIMEOUT_MS correctly', () => {
  const validCases = [
    { input: '1', expected: 1 },
    { input: '2147483647', expected: 2147483647 },
    { input: '60000', expected: 60000 }
  ];
  for (const { input, expected } of validCases) {
    const config = readConfig({ ...VALID_BASE_ENV, LLM_TIMEOUT_MS: input });
    assert.equal(config.llmTimeoutMs, expected);
  }

  const invalidCases = ['0', '2147483648', '-1', '1.5', '1e3', 'abc', '', '   '];
  for (const invalid of invalidCases) {
    assert.throws(
      () => readConfig({ ...VALID_BASE_ENV, LLM_TIMEOUT_MS: invalid }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'Invalid configuration: LLM_TIMEOUT_MS');
        return true;
      }
    );
  }
});

test('readConfig validates LLM_BASE_URL rejection without leaking credentials or query', () => {
  const invalidCases = [
    undefined,
    '',
    '   ',
    'not-a-url',
    'ftp://example.test',
    'file:///etc/hosts',
    'ws://example.test',
    'https://secretuser:secretpass@example.test',
    'https://example.test?secretquery=123',
    'https://example.test#secrethash'
  ];

  for (const invalid of invalidCases) {
    assert.throws(
      () => readConfig({ ...VALID_BASE_ENV, LLM_BASE_URL: invalid }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'Invalid configuration: LLM_BASE_URL');
        assert.equal(err.message.includes('secretuser'), false);
        assert.equal(err.message.includes('secretpass'), false);
        assert.equal(err.message.includes('secretquery'), false);
        assert.equal(err.message.includes('secrethash'), false);
        return true;
      }
    );
  }
});

test('readConfig validates LLM_API_KEY rejection without leaking secret', () => {
  const invalidCases = [undefined, '', '   '];

  for (const invalid of invalidCases) {
    assert.throws(
      () => readConfig({ LLM_BASE_URL: 'https://example.test', LLM_API_KEY: invalid }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'Invalid configuration: LLM_API_KEY');
        assert.equal(err.message.includes('test-secret-do-not-log'), false);
        return true;
      }
    );
  }
});
