import assert from 'node:assert/strict';
import { withBrowser, near, assertLayout, assertFocused, saveScreenshot } from './helpers.mjs';

await withBrowser(async ({ page, reset }) => {
  await page.setViewportSize({ width: 1440, height: 1490 });
  await reset();
  const initial = await assertLayout(page, 3, true);
  console.log(
    'Initial geometry:',
    JSON.stringify({ form: initial.form, rowHeights: initial.rows.map((r) => r[0].height) }),
  );
  assert.equal(await page.locator('[data-testid^="cell-"]').count(), 6);
  const thought = page.getByRole('button', { name: 'Думала 4 секунды', exact: true });
  await thought.click();
  assert.equal(await thought.getAttribute('aria-expanded'), 'true');
  const expanded = await assertLayout(page, 3);
  assert.ok(expanded.rows[0][0].height > initial.rows[0][0].height);
  await thought.click();

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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(
    parseFloat(await thought.evaluate((e) => getComputedStyle(e).transitionDuration)) <= 0.01,
  );
  await page.getByRole('button', { name: 'Скопировать ссылку', exact: true }).focus();
  await page.keyboard.press('Tab');
  await assertFocused(page, page.getByRole('button', { name: 'Новое сравнение', exact: true }));
  assert.equal(await page.evaluate(() => document.activeElement.matches(':focus-visible')), true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await reset();
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
