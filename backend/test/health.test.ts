import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('buildApp returns distinct Fastify instances', async (t) => {
  const app1 = buildApp({ logger: false });
  t.after(() => app1.close());
  const app2 = buildApp({ logger: false });
  t.after(() => app2.close());

  assert.notEqual(app1, app2);
  assert.ok(typeof app1.inject === 'function');
  assert.ok(typeof app2.inject === 'function');
});

test('GET /api/health returns ok', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  assert.match(response.headers['content-type'] ?? '', /application\/json/);
});

test('GET /api/unknown returns 404', async (t) => {
  const app = buildApp({ logger: false });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/api/unknown' });
  assert.equal(response.statusCode, 404);
});
