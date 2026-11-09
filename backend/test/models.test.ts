import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { validateModels, configuredModels, type Model } from '../src/models.js';

test('configuredModels is empty by default when awaiting model contract', () => {
  assert.deepEqual(configuredModels, []);
});

test('validateModels accepts empty catalog and valid catalog', () => {
  assert.doesNotThrow(() => validateModels([]));

  const validCatalog: Model[] = [
    { id: 'provider-a/model-1', name: 'Model 1', provider: 'Provider A' },
    { id: 'provider-b/model-2', name: 'Model 2', provider: 'Provider B' },
    { id: 'provider-a/Model-1', name: 'Model 1 (case variant)', provider: 'Provider A' } // Case-sensitive uniqueness
  ];
  assert.doesNotThrow(() => validateModels(validCatalog));
});

test('validateModels rejects non-array input', () => {
  assert.throws(
    () => validateModels('not-an-array' as unknown as readonly Model[]),
    /Invalid models configuration/
  );
});

test('validateModels rejects duplicate IDs', () => {
  const duplicates: Model[] = [
    { id: 'model-a', name: 'Model A', provider: 'Provider A' },
    { id: 'model-a', name: 'Model A duplicate', provider: 'Provider A' }
  ];
  assert.throws(
    () => validateModels(duplicates),
    /Invalid models configuration: duplicate model id/
  );
});

test('validateModels rejects missing, non-string, or empty fields', () => {
  const missingFields = [
    { id: '', name: 'Model', provider: 'Provider' },
    { id: 'model-1', name: '', provider: 'Provider' },
    { id: 'model-1', name: 'Model', provider: '' },
    { id: 123 as unknown as string, name: 'Model', provider: 'Provider' },
    { id: 'model-1', name: null as unknown as string, provider: 'Provider' },
    { id: 'model-1', name: 'Model', provider: undefined as unknown as string }
  ];

  for (const item of missingFields) {
    assert.throws(
      () => validateModels([item]),
      /Invalid models configuration/
    );
  }
});

test('validateModels rejects leading or trailing whitespace without auto-trimming', () => {
  const whitespaceFields: Model[] = [
    { id: ' model-1', name: 'Model', provider: 'Provider' },
    { id: 'model-1 ', name: 'Model', provider: 'Provider' },
    { id: 'model-1', name: ' Model', provider: 'Provider' },
    { id: 'model-1', name: 'Model ', provider: 'Provider' },
    { id: 'model-1', name: 'Model', provider: ' Provider' },
    { id: 'model-1', name: 'Model', provider: 'Provider ' }
  ];

  for (const item of whitespaceFields) {
    assert.throws(
      () => validateModels([item]),
      /Invalid models configuration/
    );
  }
});

test('GET /api/models returns 200 with injected fixture and JSON content-type', async (t) => {
  const fixture: Model[] = [
    { id: 'test/model-a', name: 'Model A', provider: 'Test' }
  ];
  const app = buildApp({ logger: false, models: fixture });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/models' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] ?? '', /application\/json/);
  assert.deepEqual(res.json(), { models: fixture });
});

test('GET /api/models returns 200 with empty models array when catalog is empty', async (t) => {
  const app = buildApp({ logger: false, models: [] });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/models' });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] ?? '', /application\/json/);
  assert.deepEqual(res.json(), { models: [] });
});

test('buildApp rejects invalid models configuration before creating app', () => {
  const invalidCases = [
    [{ id: 'dup', name: 'A', provider: 'P' }, { id: 'dup', name: 'B', provider: 'P' }],
    [{ id: ' with-space', name: 'A', provider: 'P' }],
    [{ id: 'a', name: '', provider: 'P' }]
  ];

  for (const invalid of invalidCases) {
    assert.throws(
      () => buildApp({ logger: false, models: invalid }),
      /Invalid models configuration/
    );
  }
});

test('buildApp snapshot isolates runtime from subsequent fixture mutations', async (t) => {
  const fixture: Model[] = [
    { id: 'test/model-a', name: 'Model A', provider: 'Test' }
  ];
  const app = buildApp({ logger: false, models: fixture });
  t.after(() => app.close());

  await app.ready();

  // Mutate fixture object and array after app creation
  fixture[0].name = 'Mutated Model Name';
  fixture.push({ id: 'test/model-b', name: 'Model B', provider: 'Test' });

  const res = await app.inject({ method: 'GET', url: '/api/models' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    models: [
      { id: 'test/model-a', name: 'Model A', provider: 'Test' }
    ]
  });
});

test('buildApp defaults to configuredModels when options.models is omitted', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/models' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { models: configuredModels });
});

test('GET /api/models response does not leak internal config or secrets', async (t) => {
  const fixture: Model[] = [
    { id: 'test/model-a', name: 'Model A', provider: 'Test' }
  ];
  const app = buildApp({ logger: false, models: fixture });
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/api/models' });
  const rawBody = res.body;

  assert.equal(rawBody.includes('llmApiKey'), false);
  assert.equal(rawBody.includes('LLM_API_KEY'), false);
  assert.equal(rawBody.includes('llmBaseUrl'), false);
  assert.equal(rawBody.includes('LLM_BASE_URL'), false);
});
