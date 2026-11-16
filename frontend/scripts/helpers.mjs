import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { createApiStub } from './apiStub.mjs';

export const near = (label, actual, expected, tolerance = 2) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );

export async function withBrowser(checks) {
  const stub = createApiStub();
  let server;
  let browser;
  try {
    const { url: stubUrl } = await stub.start();
    server = await createServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: true,
        watch: null,
        proxy: {
          '/api': {
            target: stubUrl,
            changeOrigin: true,
          },
        },
      },
    });
    await server.listen();
    const url = server.resolvedUrls.local[0];
    console.log('Verification server:', url, 'with stub:', stubUrl);
    browser = await chromium.launch({
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1490 },
      deviceScaleFactor: 1,
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    const errors = [];
    const expectedErrors = [];
    const consoleErrors = [];
    const expectedResources = [];
    const strictModeAborts = [];
    const terminalAbortChecks = [];
    const matches = (expected, request) =>
      expected.method === request.method() &&
      new URL(request.url()).origin === new URL(url).origin &&
      new URL(request.url()).pathname === expected.path &&
      new URL(request.url()).search === '';

    context.on('page', (page) => {
      let catalogLoad = { requests: 0 };
      const catalogRequests = new Map();
      const streamAttempts = new Map();
      const streamRequests = new Map();
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) catalogLoad = { requests: 0 };
      });
      page.on('request', (request) => {
        if (matches({ method: 'POST', path: '/api/stream' }, request)) {
          const body = request.postDataJSON();
          const key = JSON.stringify([body.prompt, body.modelId]);
          const attempt = (streamAttempts.get(key) || 0) + 1;
          streamAttempts.set(key, attempt);
          streamRequests.set(request, { ...body, key, attempt });
        }
        if (matches({ method: 'GET', path: '/api/models' }, request)) {
          catalogRequests.set(request, { load: catalogLoad, ordinal: ++catalogLoad.requests });
        }
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push({ text: message.text(), url: message.location().url, page });
        }
      });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => {
        const matchIndex = expectedErrors.findIndex(
          (e) => e.type === 'requestfailed' && matches(e, request),
        );
        const reason = request.failure()?.errorText;
        const catalogRequest = catalogRequests.get(request);
        if (matchIndex !== -1 && reason === 'net::ERR_ABORTED') {
          expectedErrors.splice(matchIndex, 1);
          expectedResources.push({ page, url: request.url(), reason });
        } else if (reason === 'net::ERR_ABORTED' && catalogRequest?.ordinal === 1) {
          // StrictMode can cancel its setup GET before or after Chromium starts it.
          // Accept only the first aborted GET when this navigation also issues its replacement.
          strictModeAborts.push({ ...catalogRequest, url: request.url() });
          expectedResources.push({ page, url: request.url(), reason });
        } else if (reason === 'net::ERR_ABORTED' && streamRequests.has(request)) {
          const info = streamRequests.get(request);
          // Reader cancellation after a terminal is allowed only for this attempt,
          // with HTTP200 and a matching success/error cell (never merely partial/stopped).
          terminalAbortChecks.push(
            (async () => {
              try {
                const response = await request.response();
                assert.equal(response?.status(), 200);
                await page.waitForFunction(
                  ({ prompt, modelId }) => {
                    for (const section of document.querySelectorAll('section')) {
                      const question = section.querySelector('[class*="questionBubbleWrapper"]');
                      if (question?.textContent !== prompt) continue;
                      const cell = Array.from(section.querySelectorAll('[data-testid]')).find(
                        (node) => node.getAttribute('data-testid')?.startsWith(`cell-${modelId}-`),
                      );
                      if (!cell || cell.getAttribute('aria-busy') !== 'false') continue;
                      const success = cell.querySelector('[class*="metadata"]');
                      const error =
                        cell.querySelector('button[data-action="retry"]') &&
                        !cell.querySelector('[class*="stoppedStatus"]');
                      if (success || error) return true;
                    }
                    return false;
                  },
                  info,
                  { timeout: 1000 },
                );
                assert.equal(streamAttempts.get(info.key), info.attempt);
                expectedResources.push({ page, url: request.url(), reason });
              } catch {
                errors.push(`Unverified terminal abort: ${info.modelId}, attempt ${info.attempt}`);
              }
            })(),
          );
        } else {
          errors.push(`requestfailed: ${request.method()} ${request.url()} ${reason}`);
        }
      });
      page.on('response', (response) => {
        if (response.status() >= 400) {
          const matchIndex = expectedErrors.findIndex(
            (e) =>
              e.type === 'http' && e.status === response.status() && matches(e, response.request()),
          );
          if (matchIndex !== -1) {
            expectedErrors.splice(matchIndex, 1);
            expectedResources.push({ page, url: response.url(), status: response.status() });
          } else {
            errors.push(`${response.status()} ${response.url()}`);
          }
        }
      });
    });

    const page = await context.newPage();
    const reset = async () => {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
    };

    const expectHttpError = (status, path, method = path === '/api/models' ? 'GET' : 'POST') => {
      expectedErrors.push({ type: 'http', status, path, method });
    };

    const expectRequestFailed = (path, method = path === '/api/models' ? 'GET' : 'POST') => {
      expectedErrors.push({ type: 'requestfailed', path, method });
    };

    await reset();
    await checks({ page, context, url, reset, stub, expectHttpError, expectRequestFailed });
    await Promise.all(terminalAbortChecks);

    for (const canceled of strictModeAborts) {
      if (canceled.load.requests < 2) errors.push(`Unmatched catalog abort: ${canceled.url}`);
    }
    for (const diagnostic of consoleErrors) {
      const status = diagnostic.text.match(
        /^Failed to load resource: the server responded with a status of (\d{3}) \([^\r\n]*\)$/,
      );
      const resource = expectedResources.find(
        (item) =>
          !item.consoleConsumed &&
          item.page === diagnostic.page &&
          item.url === diagnostic.url &&
          ((status && item.status === Number(status[1])) ||
            (item.reason === 'net::ERR_ABORTED' &&
              diagnostic.text === 'Failed to load resource: net::ERR_ABORTED')),
      );
      if (resource) resource.consoleConsumed = true;
      else errors.push(diagnostic.text);
    }
    assert.deepEqual(errors, [], 'console/page/network/HTTP errors');
    assert.deepEqual(
      expectedErrors,
      [],
      `Unconsumed expected errors: ${JSON.stringify(expectedErrors)}`,
    );
  } finally {
    try {
      await browser?.close();
    } finally {
      try {
        await server?.close();
      } finally {
        await stub.close();
      }
    }
  }
}

export async function sendPromptAndWait(
  page,
  prompt = 'Что ты знаешь о редакторе Editor.js? Кто его разработал и чем он отличается от аналогов?',
) {
  const input = page.getByRole('textbox', { name: 'Задайте вопрос всем моделям' });
  await input.fill(prompt);
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  await page.locator('[data-testid^="cell-"]').first().waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      !document.body.textContent.includes('Ждём ответ…') &&
      !document.body.textContent.includes('Печатает…') &&
      !document.body.textContent.includes('Получаем ответ…') &&
      document.querySelectorAll('[aria-busy="true"]').length === 0,
  );
}

export async function measureLayout(page) {
  return page.evaluate(() => {
    const box = (e) => {
      const r = e.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
        border: getComputedStyle(e).borderLeftWidth,
      };
    };
    const query = (selector) => box(document.querySelector(selector));
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      header: query('header'),
      main: query('main'),
      grid: query('[class*="gridContainer"]'),
      add: query('[class*="column"]'),
      bar: query('[class*="modelBar"]'),
      form: query('form'),
      headers: [...document.querySelectorAll('[class*="modelHeaderCell"]')].map(box),
      rows: [...document.querySelectorAll('[class*="answersRow"]')].map((row) =>
        [...row.children].map(box),
      ),
      scrollers: [...document.querySelectorAll('pre, [class*="tableWrapper"]')].map((e) => ({
        overflow: getComputedStyle(e).overflowX,
        width: e.clientWidth,
        scrollWidth: e.scrollWidth,
      })),
    };
  });
}

export async function assertLayout(page, columns, initial = false) {
  const layout = await measureLayout(page);
  assert.equal(layout.headers.length, columns);
  assert.ok(layout.scrollWidth <= layout.viewport, 'document overflow');
  near('form width', layout.form.width, 760);
  near('form height', layout.form.height, 54);
  near('form centered', layout.form.x, (layout.viewport - 760) / 2);
  near('header height', layout.header.height, 63);
  near('bar height', layout.bar.height, 64);
  assert.ok(layout.rows.length > 0, 'verify geometry with populated answers');
  for (const row of layout.rows) {
    assert.equal(row.length, columns);
    row.forEach((cell, index) => {
      near('column left', cell.x, layout.headers[index].x);
      near('column right', cell.right, layout.headers[index].right);
      near('same row top', cell.y, row[0].y, 0.1);
      near('same row bottom', cell.bottom, row[0].bottom, 0.1);
      assert.equal(cell.border, index ? '1px' : '0px');
    });
  }
  for (const scroller of layout.scrollers) assert.equal(scroller.overflow, 'auto');
  if (initial) {
    near('container x', layout.main.x, 112);
    near('container width', layout.main.width, 1216);
    near('models x', layout.grid.x, 112);
    near('models width', layout.grid.width, 1016);
    near('add x', layout.add.x, 1160);
    near('add width', layout.add.width, 168);
    near('gap', layout.add.x - layout.grid.right, 32);
    near('stretch', layout.add.height, layout.grid.height);
    near('bar y', layout.bar.y, 87);
    assert.equal(layout.rows.length, 2);
  }
  return layout;
}

export async function assertFocused(page, locator) {
  await page.waitForFunction(
    (element) => element === document.activeElement,
    await locator.elementHandle(),
    { timeout: 2000 },
  );
  assert.equal(await locator.evaluate((e) => e === document.activeElement), true);
}

export async function saveScreenshot(page, name, fullPage = false) {
  const directory = new URL('../artifacts/verification/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', directory)), fullPage });
}
