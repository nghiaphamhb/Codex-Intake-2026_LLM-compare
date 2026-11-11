import assert from 'node:assert/strict';
import { withBrowser, assertFocused, saveScreenshot } from './helpers.mjs';

await withBrowser(async (session) => {
  const { page, context, url, reset } = session;
  const add = page.getByRole('button', { name: 'Добавить модель', exact: true });
  const input = page.getByRole('textbox', { name: 'Задайте вопрос всем моделям', exact: true });
  const search = page.getByRole('textbox', { name: 'Поиск модели', exact: true });
  const dialog = page.getByRole('dialog');
  const closeAndCheck = async () => {
    await dialog.waitFor({ state: 'hidden' });
    await assertFocused(page, add);
  };
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
  await denied.locator('[class*="copyButton"]').first().click();
  await denied.waitForFunction(() =>
    document.querySelector('[class*="copyButton"]').textContent.includes('Не удалось скопировать'),
  );
  await denied.close();

  // FE005 implements these actions; the former demo-only assertions are intentionally replaced.
  await input.fill('Desktop regression prompt');
  await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click();
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 3);
  await page.getByRole('button', { name: 'Новое сравнение', exact: true }).click();
  assert.equal(await page.locator('[class*="answersRow"]').count(), 0);
  assert.equal(
    await page.getByText('Задайте вопрос, чтобы начать сравнение.', { exact: true }).count(),
    1,
  );

  await page.goto(new URL('?view=components', url).href, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('heading', { name: /Витрина компонентов/ }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Думала 4 с', exact: true }).count(), 1);
  await reset();
  await add.click();
  await assertFocused(page, search);
  assert.equal(await dialog.evaluate((e) => e.matches(':modal')), true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    // Native dialogs may yield to browser chrome; underlying document controls must stay inert.
    assert.equal(
      await dialog.evaluate(
        (e) => e.contains(document.activeElement) || document.activeElement === document.body,
      ),
      true,
    );
    assert.equal(await dialog.evaluate((e) => e.matches(':modal')), true);
  }
  await page.keyboard.press('Escape');
  await closeAndCheck();
  await add.click();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await closeAndCheck();
  await add.click();
  await search.fill('  ДЕМО АЛЬФА  ');
  assert.equal(await page.getByRole('button', { name: /Демо Альфа/ }).count(), 1);
  await page.getByRole('button', { name: /Демо Альфа/ }).focus();
  await page.keyboard.press('Enter');
  await closeAndCheck();
  assert.equal(
    await page.getByText('Модель добавлена после этого вопроса.', { exact: true }).count(),
    2,
  );
  await page.setViewportSize({ width: 1440, height: 1490 });
  await add.click();
  assert.equal(await search.inputValue(), '');
  assert.equal(await page.getByRole('button', { name: /Демо Бета/ }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: /Claude Haiku/ }).isDisabled(), true);
  assert.equal(await dialog.evaluate((e) => getComputedStyle(e).borderTopWidth), '1px');
  await saveScreenshot(page, 'picker');
  await search.fill('no-such-model');
  assert.equal(await page.getByText('Модели не найдены.', { exact: true }).count(), 1);
  await page.keyboard.press('Escape');
  await closeAndCheck();

  // Remove/re-add keeps old answers missing and correct model order.
  await page.getByRole('button', { name: 'Удалить модель Демо Альфа', exact: true }).click();
  await assertFocused(page, input);
  await page.getByRole('button', { name: /Удалить модель Yandex/ }).click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Нужно оставить минимум 2 модели', exact: true })
      .count(),
    2,
  );
  for (const button of await page
    .getByRole('button', { name: 'Нужно оставить минимум 2 модели', exact: true })
    .all())
    assert.equal(await button.isDisabled(), true);
  await add.click();
  await search.fill('  ЯНДЕКС  ');
  await page.getByRole('button', { name: /YandexGPT/ }).click();
  await closeAndCheck();
  assert.equal(
    await page.getByText('Модель добавлена после этого вопроса.', { exact: true }).count(),
    2,
  );
  await page.setViewportSize({ width: 1440, height: 1490 });
  const thought = page.getByRole('button', { name: 'Думала 4 секунды', exact: true });
  await thought.click();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  assert.equal(await thought.getAttribute('aria-expanded'), 'true');
  assert.equal(
    await page
      .getByLabel('GigaChat 2, turn-1')
      .getByText(/Демонстрационный ответ модели/)
      .count(),
    1,
  );
  await thought.click();

  await input.fill('x'.repeat(10001));
  await input.press('Enter');
  assert.equal(await input.inputValue(), 'x'.repeat(10001));
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  const description = await input.evaluate(
    (e) => document.getElementById(e.getAttribute('aria-describedby'))?.textContent,
  );
  assert.equal(description, 'Вопрос не может превышать 10 000 символов.');
  assert.equal(await page.getByRole('alert').textContent(), description);
  assert.equal(await page.locator('[class*="answersRow"]').count(), 2);
  await input.fill('First line');
  assert.equal(await input.getAttribute('aria-invalid'), null);
  assert.equal(await page.getByRole('alert').count(), 0);
  await input.press('Shift+Enter');
  await page.keyboard.insertText('Second line');
  assert.equal(await input.inputValue(), 'First line\nSecond line');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 2);
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 3);
  await assertFocused(page, input);
  const lastRow = page.locator('[class*="answersRow"]').last();
  for (const name of ['Claude Haiku 5.5', 'GigaChat 2', 'YandexGPT 5 Lite']) {
    assert.equal(
      await lastRow
        .getByText('Демонстрационный ответ модели ' + name + '.', { exact: true })
        .count(),
      1,
    );
  }
  await page.evaluate(() => navigator.clipboard.writeText('share sentinel'));
  await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).click();
  assert.equal(
    await page.getByText('Общий доступ пока не поддерживается.', { exact: true }).count(),
    1,
  );
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'share sentinel');
  await input.fill('Draft before New');
  await page.getByRole('button', { name: 'Новое сравнение', exact: true }).click();
  await assertFocused(page, input);
  assert.equal(await input.inputValue(), '');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 0);
  assert.equal(await page.locator('[class*="modelHeaderCell"]').count(), 3);
  await input.fill('After New');
  await input.press('Enter');
  assert.equal(await page.locator('[class*="answersRow"]').count(), 1);
  assert.equal(await lastRow.locator('[data-testid^="cell-"]').count(), 3);
  await reset();
  assert.equal(await page.locator('[class*="answersRow"]').count(), 2);
})
  .then(() =>
    console.log(
      'PASS browser interactions: clipboard, modal keyboard/focus, validation, comparison flows, thought and showcase.',
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
