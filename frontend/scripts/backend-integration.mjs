import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { buildApp } from '../../backend/src/app.ts';
import { createAiProxyClient } from '../../backend/src/aiProxy.ts';
import { createBackendUpstreamStub, ids, fakeKey, sentinel } from './backendUpstreamStub.mjs';

async function until(check, label, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out: ${label}`);
}

async function session(timeout, checks) {
  const stub = await createBackendUpstreamStub();
  let app, vite, browser;
  const diagnostics = [];
  const wires = [];
  let failure;
  let cleanupErrors;
  try {
    const client = createAiProxyClient({
      llmBaseUrl: stub.url,
      llmApiKey: fakeKey,
      llmTimeoutMs: timeout,
    });
    const models = await client.listModels();
    app = buildApp({
      logger: false,
      models,
      generate: client.generate,
      streamGenerate: client.streamGenerate,
    });
    const backendUrl = await app.listen({ host: '127.0.0.1', port: 0 });
    vite = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      envDir: false,
      server: {
        host: '127.0.0.1',
        port: 0,
        watch: null,
        proxy: {
          '/api': {
            target: backendUrl,
            changeOrigin: true,
            configure(proxy) {
              proxy.on('proxyRes', (response, request) => {
                if (request.url !== '/api/stream' || response.statusCode !== 200) return;
                const chunks = [];
                response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                response.on('end', () =>
                  wires.push({ body: Buffer.concat(chunks).toString('utf8') }),
                );
              });
            },
          },
        },
      },
    });
    await vite.listen();
    browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', (e) => diagnostics.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') diagnostics.push(msg.text());
    });
    // Validate HTTP failures and cancellations against the exact attempt at final verification.
    const failed = [];
    const httpErrors = [];
    const browserAttempts = new Map();
    const attemptCounts = new Map();
    page.on('request', (request) => {
      if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/stream') return;
      const payload = request.postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(), ['modelId', 'prompt']);
      assert.equal(request.headers()['x-api-key'], undefined);
      const key = JSON.stringify([payload.modelId, payload.prompt]);
      const ordinal = (attemptCounts.get(key) ?? 0) + 1;
      attemptCounts.set(key, ordinal);
      browserAttempts.set(request, { ...payload, ordinal });
    });
    page.on('requestfailed', (req) => failed.push(req));
    page.on('response', (res) => {
      if (res.status() >= 400) httpErrors.push(res);
    });
    const url = vite.resolvedUrls.local[0];
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== new URL(url).origin) {
        diagnostics.push('Unexpected external request');
        return route.abort();
      }
      return route.continue();
    });
    const cell = (id) => page.locator(`[data-testid^="cell-${id}-"]`).last();
    const newChat = async () => {
      await page.getByRole('button', { name: 'Новое сравнение', exact: true }).click();
    };
    const configure = async (n) => {
      await newChat();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('[class*="modelBar"]').waitFor({ state: 'visible' });
      for (const id of ids) {
        const label = `BE009 ${'ABCD'[ids.indexOf(id)]}`;
        const remove = page.getByRole('button', { name: `Удалить модель ${label}`, exact: true });
        if (ids.indexOf(id) >= n && (await remove.count())) await remove.click();
      }
      for (const id of ids.slice(0, n)) {
        const label = `BE009 ${'ABCD'[ids.indexOf(id)]}`;
        if (!(await page.locator(`[class*="modelBar"] [data-model-id="${id}"]`).count())) {
          await page.getByRole('button', { name: 'Добавить модель', exact: true }).click();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: new RegExp(label) })
            .click();
        }
      }
    };
    let serial = 0;
    const send = async (n, mode = 'hold') => {
      stub.setScenario(mode);
      const prompt = `  BE009 ${++serial} — câu hỏi 🧪  `;
      const start = stub.attempts.length;
      await page
        .getByRole('textbox', { name: 'Задайте вопрос всем моделям', exact: true })
        .fill(prompt);
      await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
      await until(() => stub.attempts.length === start + n, 'all upstream requests received');
      const attempts = stub.attempts.slice(start);
      assert.deepEqual(attempts.map((a) => a.model).sort(), ids.slice(0, n).sort());
      assert.ok(attempts.every((a) => a.prompt === prompt));
      return attempts;
    };
    const success = async (id) =>
      cell(id).locator('[class*="metadata"]').waitFor({ state: 'visible' });
    const idle = () =>
      until(async () => (await page.locator('[aria-busy="true"]').count()) === 0, 'UI idle');
    await page.goto(url);
    await page.getByRole('button', { name: 'Удалить модель BE009 A', exact: true }).waitFor();
    const catalog = await (await page.request.get(`${url}api/models`)).json();
    for (const model of catalog.models)
      assert.deepEqual(Object.keys(model).sort(), ['id', 'name', 'provider']);
    assert.equal(stub.catalogCalls, 1);
    await checks({ page, stub, cell, configure, send, success, idle, newChat, wires });
    await idle();
    const expectedDone = stub.attempts.filter(
      (a) =>
        a.finished &&
        !(a.mode === 'http' && a.model === ids[1] && a.ordinal === 1) &&
        !(a.mode === 'eof' && a.model === ids[1]),
    );
    await until(
      () =>
        wires
          .flatMap((w) => w.body.trim().split('\n').map(JSON.parse))
          .filter((e) => e.type === 'done').length === expectedDone.length,
      'every completed upstream has public done',
    );
    assert.ok(wires.length > 0);
    const doneModels = wires.flatMap(({ body }) => {
      const events = body.trim().split('\n').map(JSON.parse);
      return events.some((event) => event.type === 'done') ? [events[0].modelId] : [];
    });
    assert.deepEqual(doneModels.sort(), expectedDone.map((attempt) => attempt.model).sort());
    for (const { body } of wires) {
      for (const forbidden of [fakeKey, sentinel, 'inputTokens', 'outputTokens', 'pricing'])
        assert.ok(!body.includes(forbidden), `public wire leaked ${forbidden}`);
      const events = body.trim().split('\n').map(JSON.parse);
      assert.equal(events[0].type, 'start');
      assert.equal(events.filter((e) => e.type === 'start').length, 1);
      assert.equal(events.filter((e) => ['done', 'error'].includes(e.type)).length, 1);
      for (const e of events.filter((e) => e.type === 'done')) {
        assert.deepEqual(Object.keys(e).sort(), ['costUsd', 'durationMs', 'type']);
        assert.ok(Number.isFinite(e.durationMs) && e.durationMs >= 0);
        const index = ids.indexOf(events[0].modelId);
        if (index === 0) assert.ok(Math.abs(e.costUsd - 0.00005) < 1e-12);
        else assert.equal(e.costUsd, index === 2 ? 0 : null);
      }
    }
    assert.ok(
      !(await page.content().then((body) => body.includes(sentinel) || body.includes(fakeKey))),
    );
    for (const response of httpErrors) {
      assert.equal(response.status(), 429);
      const body = response.request().postDataJSON();
      assert.ok(
        stub.attempts.some(
          (a) =>
            a.mode === 'http' &&
            a.ordinal === 1 &&
            a.model === body.modelId &&
            a.prompt === body.prompt,
        ),
      );
      assert.ok(!(await response.text()).includes(sentinel));
    }
    for (const req of failed) {
      assert.equal(req.failure().errorText, 'net::ERR_ABORTED');
      const path = new URL(req.url()).pathname;
      if (path === '/api/models') {
        assert.ok(catalog.models.length === 4);
        continue;
      }
      assert.equal(path, '/api/stream');
      const payload = browserAttempts.get(req);
      assert.ok(payload);
      assert.ok(
        stub.attempts.some(
          (a) =>
            a.model === payload.modelId &&
            a.prompt === payload.prompt &&
            a.ordinal === payload.ordinal &&
            (a.disconnected || a.finished),
        ),
      );
    }
    for (const message of diagnostics)
      assert.ok(
        httpErrors.length &&
          /^Failed to load resource: the server responded with a status of 429/.test(message),
        message,
      );
    assert.deepEqual(stub.failures, []);
    assert.equal(stub.active().length, 0);
  } catch (error) {
    failure = error;
  } finally {
    const cleanup = await Promise.allSettled([
      Promise.resolve().then(() => browser?.close()),
      Promise.resolve().then(() => vite?.close()),
      Promise.resolve().then(() => stub.close()),
      Promise.resolve().then(() => app?.close()),
    ]);
    cleanupErrors = cleanup
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
  }
  if (failure || cleanupErrors.length)
    throw new AggregateError(
      [...(failure ? [failure] : []), ...cleanupErrors],
      'BE009 session failed',
    );
  console.log(
    `PASS BE009 session (${timeout}ms): ${stub.attempts.length} local attempts, ${wires.length} complete public wires`,
  );
}

await session(10000, async ({ page, stub, cell, configure, send, success, idle, newChat }) => {
  for (const n of [2, 3, 4]) {
    await configure(n);
    const attempts = await send(n);
    assert.equal(stub.active().length, n);
    await cell(ids[0]).getByText(`Xin chào — ${ids[0]} 🧪`, { exact: false }).waitFor();
    assert.equal(await cell(ids[0]).getAttribute('aria-busy'), 'true');
    assert.ok(attempts.every((a) => !a.finished));
    const thought = cell(ids[0]).getByRole('button', { name: 'Рассуждения' });
    await thought.click();
    assert.equal(await cell(ids[1]).getByRole('button', { name: 'Рассуждения' }).count(), 0);
    for (const a of [...attempts].reverse()) stub.finish(a);
    await idle();
    for (const id of ids.slice(0, n)) {
      await success(id);
      await cell(id).getByText(`Xin chào — ${id} 🧪`, { exact: false }).waitFor();
    }
    assert.equal(await cell(ids[0]).locator('[title^="Оценочная стоимость:"]').count(), 1);
    assert.equal(await cell(ids[0]).getByText('< $0,0001', { exact: true }).count(), 1);
    assert.equal(await cell(ids[1]).locator('[title^="Оценочная стоимость:"]').count(), 0);
    if (n >= 3) assert.equal(await cell(ids[2]).getByText('$0,0000', { exact: true }).count(), 1);
    assert.equal(await thought.getAttribute('aria-expanded'), 'true');
    assert.equal(await cell(ids[0]).locator('pre code').textContent(), 'const ok = true;\n');
    if (n === 4) {
      await mkdir(new URL('../artifacts/verification/', import.meta.url), { recursive: true });
      await page.screenshot({
        path: fileURLToPath(
          new URL('../artifacts/verification/be009-integration-success.png', import.meta.url),
        ),
      });
    }
  }
  for (const mode of ['http', 'eof']) {
    await configure(2);
    const attempts = await send(2, mode);
    await cell(ids[1]).getByRole('button', { name: 'Повторить' }).waitFor();
    assert.equal(await cell(ids[0]).getAttribute('aria-busy'), 'true');
    stub.finish(attempts.find((a) => a.model === ids[0]));
    await success(ids[0]);
    assert.equal(await cell(ids[1]).locator('[class*="metadata"]').count(), 0);
    if (mode === 'eof')
      await cell(ids[1]).getByText(`Xin chào — ${ids[1]} 🧪`, { exact: false }).waitFor();
    if (mode === 'http') {
      const count = stub.attempts.length;
      await cell(ids[1]).getByRole('button', { name: 'Повторить' }).click();
      await until(() => stub.attempts.length === count + 1, 'retry only B');
      assert.equal(stub.attempts.at(-1).model, ids[1]);
      stub.finish(stub.attempts.at(-1));
      await success(ids[1]);
    }
  }
  await configure(2);
  let attempts = await send(2);
  await cell(ids[0]).locator('[class*="cellStopButton"]').click();
  await until(() => attempts[0].disconnected || attempts[1].disconnected, 'single disconnect');
  assert.equal(attempts.filter((a) => a.disconnected).length, 1);
  assert.equal(attempts.find((a) => a.disconnected).model, ids[0]);
  assert.equal(stub.active().length, 1);
  await cell(ids[0]).getByText('Генерация остановлена.', { exact: true }).waitFor();
  await cell(ids[0]).getByText(`Xin chào — ${ids[0]} 🧪`, { exact: false }).waitFor();
  const beforeRetry = stub.attempts.length;
  await cell(ids[0]).getByRole('button', { name: 'Повторить' }).click();
  await until(() => stub.attempts.length === beforeRetry + 1, 'retry stopped A');
  assert.equal(stub.attempts.at(-1).model, ids[0]);
  for (const a of stub.active()) stub.finish(a);
  await idle();
  await configure(4);
  attempts = await send(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /BE009 A/ }).click();
  const thought = cell(ids[0]).getByRole('button', { name: 'Рассуждения' });
  await thought.click();
  const count = stub.attempts.length;
  await page.getByRole('tab', { name: /BE009 B/ }).click();
  await page.getByRole('tab', { name: /BE009 A/ }).click();
  assert.equal(await thought.getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Удалить модель BE009 A', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /BE009 A/ }).waitFor();
  assert.equal(stub.attempts.length, count);
  assert.equal(attempts.filter((a) => a.disconnected).length, 0);
  stub.finish(attempts.find((a) => a.model === ids[0]));
  await success(ids[0]);
  await page.getByRole('button', { name: 'Остановить генерацию', exact: true }).click();
  await until(() => attempts.filter((a) => a.disconnected).length === 3, 'hidden streams stopped');
  await idle();
  await page.screenshot({
    path: fileURLToPath(
      new URL('../artifacts/verification/be009-integration-mobile-stop.png', import.meta.url),
    ),
  });
  await configure(2);
  attempts = await send(2);
  await newChat();
  await until(() => attempts.every((a) => a.disconnected), 'New cancels both');
  attempts.forEach(stub.finish);
  assert.equal(await page.locator('[data-testid^="cell-"]').count(), 0);
  await configure(3);
  attempts = await send(3);
  await page.getByRole('button', { name: 'Удалить модель BE009 A', exact: true }).click();
  await until(() => attempts.find((a) => a.model === ids[0]).disconnected, 'remove cancels A');
  assert.equal(stub.active().length, 2);
  for (const a of stub.active()) stub.finish(a);
  await idle();
  const removedCount = stub.attempts.length;
  await page.getByRole('button', { name: 'Добавить модель', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /BE009 A/ })
    .click();
  assert.equal(stub.attempts.length, removedCount);
});

await session(500, async ({ configure, send, cell, success, idle, stub }) => {
  await configure(2);
  const attempts = await send(2, 'timeout');
  await success(ids[0]);
  await cell(ids[1]).getByText('Время ожидания истекло.', { exact: true }).waitFor();
  await until(
    () => attempts.find((a) => a.model === ids[1]).disconnected,
    'timeout upstream closed',
  );
  await idle();
  assert.equal(stub.attempts.length, 2);
});
console.log(
  'PASS BE009 backend integration: parallel2/3/4, incremental, reasoning, costs, errors, retry, abort and isolation',
);
