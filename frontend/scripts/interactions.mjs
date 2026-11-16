import assert from 'node:assert/strict';
import { withBrowser, assertFocused, saveScreenshot, sendPromptAndWait } from './helpers.mjs';
import { defaultStubCatalog } from './apiStub.mjs';

await withBrowser(async (session) => {
  const { page, context, url, reset, stub, expectHttpError, expectRequestFailed } = session;
  const add = page.getByRole('button', { name: 'Добавить модель', exact: true });
  const input = page.getByRole('textbox', { name: 'Задайте вопрос всем моделям', exact: true });
  const search = page.getByRole('textbox', { name: 'Поиск модели', exact: true });
  const dialog = page.getByRole('dialog');
  const closeAndCheck = async () => {
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(page, (await add.isDisabled()) ? input : add);
  };

  // 1. Initial Send & Markdown / Copy test
  await sendPromptAndWait(page, 'Тестовый вопрос для проверки кода');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 1);

  const codeCopy = page.locator('[class*="copyButton"]').first();
  const expectedCode = await page.locator('pre code').first().textContent();
  await codeCopy.click();
  await page.waitForFunction(() =>
    document.querySelector('[class*="copyButton"]').textContent.includes('Скопировано'),
  );
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'),
    expectedCode.replace(/\r\n/g, '\n'),
  );

  const denied = await context.newPage();
  await denied.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('Permission denied');
        },
      },
    }),
  );
  await denied.goto(url, { waitUntil: 'networkidle' });
  await sendPromptAndWait(denied, 'Вопрос в denied context');
  await denied.locator('[class*="copyButton"]').first().click();
  await denied.waitForFunction(() =>
    document.querySelector('[class*="copyButton"]').textContent.includes('Не удалось скопировать'),
  );
  await denied.close();
  await page.bringToFront();

  assert.equal(await page.getByText('$0,0016', { exact: true }).count(), 1);
  assert.equal(await page.getByText('$0,0000', { exact: true }).count(), 1);
  assert.equal(await page.locator('[title^="Оценочная стоимость:"]').count(), 2);

  // 2. Overlap & pending state with barrier
  stub.setHoldGenerate(true);
  await input.fill('Вопрос для проверки одновременности');
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  await page.getByText('Ждём ответ…').first().waitFor({ state: 'visible' });
  assert.equal(await page.getByText('Ждём ответ…').count(), 3);
  await stub.waitForActive(3);
  stub.releaseGenerate();
  stub.setHoldGenerate(false);
  await page.waitForFunction(() => !document.body.textContent.includes('Ждём ответ…'));
  assert.equal(await page.locator('[class*="answersRow"]').count(), 2);

  // 3. Error handling & Retry on single cell
  stub.setGenerateFault('giga-demo', {
    status: 504,
    body: { error: { code: 'UPSTREAM_TIMEOUT', message: 'Upstream gateway timeout' } },
  });
  expectHttpError(504, '/api/generate');

  await input.fill('Вопрос с ошибкой одной модели');
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('Ждём ответ…'));

  const gigaCell = page.locator('[data-testid^="cell-giga-demo-"]').last();
  assert.equal(await gigaCell.getByText('Время ожидания истекло.').count(), 1);
  const retryBtn = gigaCell.getByRole('button', { name: 'Повторить', exact: true });
  assert.equal(await retryBtn.count(), 1);

  stub.clearFault('giga-demo');
  const beforeRetry = structuredClone(stub.counters);
  await retryBtn.click();
  await page.waitForFunction(() => !document.body.textContent.includes('Ждём ответ…'));
  assert.equal(await gigaCell.getByText('Время ожидания истекло.').count(), 0);
  assert.equal(await gigaCell.getByText(/Ответ GigaChat 2/).count(), 1);
  assert.equal(stub.counters.totalRequests, beforeRetry.totalRequests + 1);
  for (const [id, count] of Object.entries(beforeRetry.byModel))
    assert.equal(stub.counters.byModel[id], count + (id === 'giga-demo' ? 1 : 0));

  // 4. New comparison while pending (late response guard)
  stub.setHoldGenerate(true);
  await input.fill('Вопрос перед New');
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  await page.getByText('Ждём ответ…').first().waitFor({ state: 'visible' });
  assert.equal(await page.getByText('Ждём ответ…').count(), 3);

  expectRequestFailed('/api/generate');
  expectRequestFailed('/api/generate');
  expectRequestFailed('/api/generate');

  await page.getByRole('button', { name: 'Новое сравнение', exact: true }).click();
  await assertFocused(page, input);
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 0);
  assert.equal(
    await page.getByText('Задайте вопрос, чтобы начать сравнение.', { exact: true }).count(),
    1,
  );

  stub.releaseGenerate();
  stub.setHoldGenerate(false);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('[class*="answersRow"]').count(), 0);

  // 5. Add model & 4-column layout
  await add.click();
  await assertFocused(page, search);
  assert.equal(await dialog.evaluate((e) => e.matches(':modal')), true);

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    assert.equal(
      await dialog.evaluate(
        (e) => e.contains(document.activeElement) || document.activeElement === document.body,
      ),
      true,
    );
  }
  await page.keyboard.press('Escape');
  await closeAndCheck();

  await add.click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await closeAndCheck();

  // Model picker search and disabled state
  await add.click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.getByRole('button', { name: /Демо Альфа/ }).isDisabled(), false);
  assert.equal(await dialog.getByRole('button', { name: /Claude Haiku/ }).isDisabled(), true);
  await dialog.getByRole('button', { name: /Демо Альфа/ }).hover();
  await saveScreenshot(page, 'picker');
  await search.fill('no-such-model');
  assert.equal(await page.getByText('Модели не найдены.', { exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await closeAndCheck();

  await add.click();
  await search.fill('  ДЕМО АЛЬФА  ');
  assert.equal(await page.getByRole('button', { name: /Демо Альфа/ }).count(), 1);
  await page.getByRole('button', { name: /Демо Альфа/ }).focus();
  await page.keyboard.press('Enter');
  await closeAndCheck();
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 4);

  // Send turn with 4 models
  stub.setHoldGenerate(true);
  await input.fill('Вопрос для 4 моделей');
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  await stub.waitForActive(4);
  stub.releaseGenerate('claude-demo');
  await page.waitForFunction(() => document.body.textContent.split('Ждём ответ…').length - 1 === 3);
  stub.setHoldGenerate(false);
  await page.waitForFunction(() => !document.body.textContent.includes('Ждём ответ…'));
  assert.equal(await page.locator('[class*="answersRow"]').count(), 1);
  assert.equal(await page.locator('[data-testid^="cell-"]').count(), 4);

  // 6. Remove model, minimum 2 models limit, and re-add
  await page.getByRole('button', { name: 'Удалить модель Демо Альфа', exact: true }).click();
  await assertFocused(page, input);
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 3);

  await page.getByRole('button', { name: /Удалить модель Yandex/ }).click();
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 2);
  assert.equal(
    await page
      .getByRole('button', { name: 'Нужно оставить минимум 2 модели', exact: true })
      .count(),
    2,
  );
  for (const button of await page
    .getByRole('button', { name: 'Нужно оставить минимум 2 модели', exact: true })
    .all()) {
    assert.equal(await button.isDisabled(), true);
  }

  // Re-add YandexGPT: placeholder for past turn
  await add.click();
  await search.fill('  ЯНДЕКС  ');
  await page.getByRole('button', { name: /YandexGPT/ }).click();
  await closeAndCheck();
  assert.equal(
    await page.getByText('Модель добавлена после этого вопроса.', { exact: true }).count(),
    1,
  );

  // 7. Validation & IME
  await input.fill('x'.repeat(10001));
  await input.press('Enter');
  assert.equal(await input.inputValue(), 'x'.repeat(10001));
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  const description = await input.evaluate(
    (e) => document.getElementById(e.getAttribute('aria-describedby'))?.textContent,
  );
  assert.equal(description, 'Вопрос не может превышать 10 000 символов.');
  assert.equal(await page.getByRole('alert').textContent(), description);
  assert.equal(await page.locator('[class*="answersRow"]').count(), 1);

  await input.fill('First line');
  assert.equal(await input.getAttribute('aria-invalid'), null);
  assert.equal(await page.getByRole('alert').count(), 0);
  await input.press('Shift+Enter');
  await page.keyboard.insertText('Second line');
  assert.equal(await input.inputValue(), 'First line\nSecond line');

  const beforeComposition = stub.counters.totalRequests;
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    isComposing: true,
    keyCode: 229,
    bubbles: true,
    cancelable: true,
  });
  assert.equal(stub.counters.totalRequests, beforeComposition);
  assert.equal(await input.inputValue(), 'First line\nSecond line');
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  assert.equal(await input.inputValue(), '');
  await page.waitForFunction(() => !document.body.textContent.includes('Ждём ответ…'));
  assert.equal(await page.locator('[class*="answersRow"]').count(), 2);

  // 8. Share button: unsupported alert, clipboard untouched
  await page.evaluate(() => navigator.clipboard.writeText('share sentinel'));
  await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
  assert.equal(
    await page.getByText('Общий доступ пока не поддерживается.', { exact: true }).count(),
    1,
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'share sentinel');

  // 9. Showcase & Reduced Motion
  await page.goto(new URL('?view=components', url).href, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('heading', { name: /Витрина компонентов/ }).count(), 1);
  const thought = page.getByRole('button', { name: 'Думала 4 с', exact: true });
  assert.equal(await thought.count(), 1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(
    parseFloat(await thought.evaluate((e) => getComputedStyle(e).transitionDuration)) <= 0.01,
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // 10. Catalog edge cases: Error & Retry, Empty (0), One model (1)
  stub.setCatalogFault({
    status: 500,
    body: { error: { code: 'UPSTREAM_ERROR', message: 'Catalog error' } },
  });
  expectHttpError(500, '/api/models');

  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('alert').getByText('Не удалось загрузить модели.').count(), 1);
  const retryCatalogBtn = page.getByRole('button', { name: 'Повторить загрузку', exact: true });
  assert.equal(await retryCatalogBtn.count(), 1);

  stub.clearCatalogFault();
  await retryCatalogBtn.click();
  await page.waitForFunction(() => document.querySelectorAll('[role="alert"]').length === 0);
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 3);

  // Catalog empty (0 models)
  stub.setCatalog([]);
  await reset();
  assert.equal(await page.getByText('Нет доступных моделей.', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Отправить вопрос' }).isDisabled(), true);

  // Catalog 1 model
  stub.setCatalog([defaultStubCatalog[0]]);
  await reset();
  assert.equal(
    await page.getByRole('status').getByText('Для сравнения нужны минимум две модели.').count(),
    1,
  );
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Отправить вопрос' }).isDisabled(), true);

  // Restore normal catalog
  stub.resetCatalog();
  await reset();
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 3);
  // Two-model overlap also crosses the real Vite proxy into the stub.
  await page.getByRole('button', { name: /Удалить модель Yandex/ }).click();
  stub.setHoldGenerate(true);
  await input.fill('Два одновременных запроса');
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  await stub.waitForActive(2);
  stub.setHoldGenerate(false);
  await page.waitForFunction(() => !document.body.textContent.includes('Ждём ответ…'));
  // FE007: anchored picker, offline inline icons and constrained viewport.
  await add.click();
  const bounds = await dialog.boundingBox();
  const addBounds = await add.boundingBox();
  assert.ok(Math.abs(bounds.x + bounds.width - addBounds.x - addBounds.width) < 2);
  assert.equal(await dialog.getByPlaceholder('Найти модель').count(), 1);
  assert.equal(await dialog.getByText('В сравнении может быть до 4 моделей').count(), 1);
  assert.equal(await dialog.locator('img, use, image').count(), 0);
  const panel = await dialog.boundingBox();
  await page.mouse.click(panel.x + 4, panel.y + 4);
  assert.equal(await dialog.count(), 1);
  await search.fill('Демо');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await dialog.evaluate((e) => e.contains(document.activeElement)), true);
  await search.fill('');
  await page.mouse.click(16, 200);
  await closeAndCheck();
  await add.click();
  await context.setOffline(true);
  await saveScreenshot(page, 'fe007-picker-offline');
  assert.ok((await dialog.locator('svg').count()) >= 3);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await closeAndCheck();
  stub.setCatalog(
    Array.from({ length: 30 }, (_, i) => ({
      id: 'long-' + i,
      name: 'Long model ' + i,
      provider: 'Provider',
    })),
  );
  await reset();
  await page.setViewportSize({ width: 1280, height: 360 });
  await add.click();
  await search.fill('');
  await page.waitForFunction(() => {
    const d = document.querySelector('dialog').getBoundingClientRect();
    return d.top >= 15 && d.bottom <= innerHeight - 15;
  });
  assert.equal(
    await dialog.locator('[class*="modelList"]').evaluate((e) => e.scrollHeight > e.clientHeight),
    true,
  );
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await add.click();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await page.waitForFunction(() => {
    const d = document.querySelector('dialog').getBoundingClientRect(),
      v = visualViewport;
    return (
      d.left >= v.offsetLeft + 15 &&
      d.right <= v.offsetLeft + v.width - 15 &&
      d.bottom <= v.offsetTop + v.height - 15
    );
  });
  await saveScreenshot(page, 'fe007-picker-zoom2');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await cdp.detach();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  stub.resetCatalog();
})
  .then(() =>
    console.log(
      'PASS browser interactions: clipboard, modal keyboard/focus, validation, comparison flows, catalog edge cases and showcase.',
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
