import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

export const near = (label, actual, expected, tolerance = 2) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, got ${actual}`,
  );

export async function withBrowser(checks) {
  const server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  let browser;
  try {
    await server.listen();
    const url = server.resolvedUrls.local[0];
    console.log('Verification server:', url);
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
    context.on('page', (page) => {
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('requestfailed', (request) => errors.push(request.url()));
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
    });
    const page = await context.newPage();
    const reset = async () => {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
    };
    await reset();
    await checks({ page, context, url, reset });
    assert.deepEqual(errors, [], 'console/page/network/HTTP errors');
  } finally {
    await browser?.close();
    await server.close();
  }
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
  const directory = new URL('../../artifacts/verification/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', directory)), fullPage });
}
