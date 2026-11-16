import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateCostUsd } from '../src/cost.js';
import { buildApp } from '../src/app.js';
import type { ModelPricing } from '../src/models.js';
import type { GenerateUsage } from '../src/aiProxy.js';

test('cost estimates standard USD without rounding or double-counting', () => {
  const pricing = Object.freeze({ input: 0.25, output: 2 });
  for (const [outputTokens, expected] of [
    [500, 0.00125],
    [675, 0.0016],
  ]) {
    assert.ok(
      Math.abs(
        estimateCostUsd(pricing, Object.freeze({ inputTokens: 1000, outputTokens }))! - expected,
      ) < 1e-12,
    );
  }
  assert.equal(estimateCostUsd(pricing, { inputTokens: 0, outputTokens: 0 }), 0);
  assert.equal(estimateCostUsd({ input: 0, output: 0 }, { inputTokens: 1, outputTokens: 1 }), 0);
  for (const invalid of [
    undefined,
    null,
    [],
    {},
    { input: -1, output: 2 },
    { input: Infinity, output: 2 },
    { input: '1', output: 2 },
  ]) {
    assert.equal(
      estimateCostUsd(invalid as ModelPricing, { inputTokens: 1, outputTokens: 1 }),
      null,
    );
  }
  for (const invalid of [
    undefined,
    null,
    [],
    {},
    { inputTokens: -1, outputTokens: 1 },
    { inputTokens: 1.5, outputTokens: 1 },
    { inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 1 },
  ]) {
    assert.equal(estimateCostUsd(pricing, invalid as GenerateUsage), null);
  }
  assert.equal(
    estimateCostUsd(
      { input: Number.MAX_VALUE, output: Number.MAX_VALUE },
      { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER },
    ),
    null,
  );
});

test('route cost uses isolated pricing snapshot by ID, preserves public catalog, and retries independently', async () => {
  const models = [
    { id: 'test/a', name: 'Same', provider: 'Test', pricing: { input: 0.25, output: 2 } },
    { id: 'test/b', name: 'Same', provider: 'Test', pricing: { input: 1, output: 4 } },
    { id: 'test/c', name: 'Same', provider: 'Test' },
  ];
  let calls = 0;
  const app = buildApp({
    models,
    generate: async () => {
      calls++;
      return { text: '', durationMs: 0, usage: { inputTokens: 1000, outputTokens: 500 } };
    },
  });
  try {
    models[0].pricing!.input = 999;
    assert.deepEqual((await app.inject('/api/models')).json(), {
      models: models.map(({ id, name, provider }) => ({ id, name, provider })),
    });
    const responses = await Promise.all(
      models.map((model) =>
        app.inject({
          method: 'POST',
          url: '/api/generate',
          payload: { prompt: 'Hi', modelId: model.id },
        }),
      ),
    );
    for (const [i, expected] of [0.00125, 0.003, null].entries()) {
      const json = responses[i].json();
      assert.deepEqual(Object.keys(json).sort(), ['costUsd', 'durationMs', 'modelId', 'text']);
      if (expected === null) assert.equal(json.costUsd, null);
      else assert.ok(Math.abs(json.costUsd - expected) < 1e-12);
    }
    await app.inject({
      method: 'POST',
      url: '/api/generate',
      payload: { prompt: 'Hi', modelId: 'test/a' },
    });
    assert.equal(calls, 4);
  } finally {
    await app.close();
  }
});
