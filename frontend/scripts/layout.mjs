import assert from 'node:assert/strict';
import {
  withBrowser,
  near,
  assertLayout,
  assertFocused,
  saveScreenshot,
  sendPromptAndWait,
} from './helpers.mjs';

await withBrowser(async ({ page, reset }) => {
  await page.setViewportSize({ width: 1440, height: 1490 });
  await reset();
  await sendPromptAndWait(
    page,
    'Что ты знаешь о редакторе Editor.js? Кто его разработал и чем он отличается от аналогов?',
  );
  await sendPromptAndWait(
    page,
    'Второй вопрос для проверки геометрии и скролла всей страницы сравнения моделей',
  );
  const initial = await assertLayout(page, 3, true);
  console.log(
    'Initial geometry:',
    JSON.stringify({ form: initial.form, rowHeights: initial.rows.map((r) => r[0].height) }),
  );
  assert.equal(await page.locator('[data-testid^="cell-"]').count(), 6);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 400));
  near('sticky top', (await page.locator('[class*="modelBar"]').boundingBox()).y, 16);
  await page.evaluate(() => window.scrollTo(0, 0));
  near('initial bar top', (await page.locator('[class*="modelBar"]').boundingBox()).y, 87);

  const input = page.getByRole('textbox', { name: 'Задайте вопрос всем моделям' });
  await input.fill(Array(20).fill('Длинный вопрос для проверки переноса').join('\n'));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(() => document.querySelector('textarea').clientHeight === 160);
  assert.ok(
    await input.evaluate(
      (e) => e.scrollHeight > e.clientHeight && getComputedStyle(e).overflowY === 'auto',
    ),
  );
  await input.fill('');
  await assertLayout(page, 3);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1280);

  await page.setViewportSize({ width: 1440, height: 1490 });
  await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).focus();
  await page.keyboard.press('Tab');
  await assertFocused(page, page.getByRole('button', { name: 'Новое сравнение', exact: true }));
  assert.equal(await page.evaluate(() => document.activeElement.matches(':focus-visible')), true);

  await reset();
  await sendPromptAndWait(page);
  await saveScreenshot(page, 'layout-initial');

  for (const columns of [3, 4, 2]) {
    if (columns === 4) {
      await page.getByRole('button', { name: 'Добавить модель', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Демо Альфа/ })
        .click();
    }
    if (columns === 2) {
      await page.getByRole('button', { name: 'Удалить модель Демо Альфа', exact: true }).click();
      await page.getByRole('button', { name: 'Удалить модель GigaChat 2', exact: true }).click();
    }
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 1490 });
      await assertLayout(page, columns);
    }
    if (columns === 4) {
      await page.setViewportSize({ width: 1440, height: 1490 });
      await saveScreenshot(page, 'layout-four-models', true);
    }
  }
})
  .then(() =>
    console.log(
      'PASS browser layout: geometry, 2/3/4 columns, overflow, sticky, multiline and focus visibility.',
    ),
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
