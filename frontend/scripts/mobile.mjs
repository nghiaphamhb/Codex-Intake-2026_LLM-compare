import assert from 'node:assert/strict';
import { withBrowser, saveScreenshot } from './helpers.mjs';

await withBrowser(async (session) => {
  const { page, reset, stub, expectRequestFailed } = session;

  console.log('Testing mobile layout and interactions...');

  // 1. Initial 390px viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await reset();

  // Verify initial empty state on mobile
  const initialScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(
    initialScrollWidth <= 391,
    `Initial 390px document scrollWidth should be <= 391, got ${initialScrollWidth}`,
  );

  const emptyTablist = page.getByRole('tablist', { name: 'Модели для сравнения' });
  await emptyTablist.waitFor({ state: 'visible' });

  const initialTabs = emptyTablist.getByRole('tab');
  assert.equal(await initialTabs.count(), 3);
  assert.equal(await initialTabs.nth(0).getAttribute('aria-selected'), 'true');
  assert.equal(await initialTabs.nth(1).getAttribute('aria-selected'), 'false');

  await saveScreenshot(page, 'mobile-initial');
  assert.equal(
    await page.getByRole('button', { name: 'Удалить модель Claude Haiku 5.5' }).count(),
    1,
  );
  const initialRemove = await page
    .getByRole('button', { name: 'Удалить модель Claude Haiku 5.5' })
    .boundingBox();
  assert.ok(initialRemove.width >= 44 && initialRemove.height >= 44);
  const mobileComposer = await page.locator('form').boundingBox();
  assert.equal(mobileComposer.x, 12);
  assert.equal(mobileComposer.width, 366);

  // 2. Viewports check for scrollWidth <= innerWidth + 1
  const testViewports = [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1279, height: 900 },
    { width: 1280, height: 900 },
    { width: 1440, height: 900 },
  ];

  for (const vp of testViewports) {
    await page.setViewportSize(vp);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(
      sw <= vp.width + 1,
      `Viewport ${vp.width}x${vp.height}: scrollWidth ${sw} exceeds innerWidth + 1`,
    );
  }

  // Back to 390px for detailed mobile test
  await page.setViewportSize({ width: 390, height: 844 });

  // 3. Send prompt and verify streaming and tabs
  stub.setHoldGenerate(true);
  const composerInput = page.getByRole('textbox', { name: 'Задайте вопрос всем моделям' });
  await composerInput.fill('Что такое квантовые вычисления? Объясни простыми словами.');
  await page.getByRole('button', { name: 'Отправить вопрос' }).click();

  // Wait for 3 active streams
  await stub.waitForActive(3);
  stub.sendPartialGenerate();

  // Wait for partial stream deltas
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'visible' });

  // Verify only 1 visible cell panel per turn on mobile
  const visiblePanels = await page.locator('[role="tabpanel"]:not([hidden])').count();
  assert.equal(visiblePanels, 1, `Expected 1 visible panel on mobile, got ${visiblePanels}`);

  // Switch tab while streaming
  const activeTabs = page.locator('[role="tablist"] [role="tab"]');
  const requestsBeforeSwitch = stub.counters.streamRequests;
  const abortedBeforeSwitch = stub.counters.abortedRequests || 0;
  const reasoning = page.getByRole('button', { name: 'Рассуждения', exact: true });
  await reasoning.click();
  await activeTabs.nth(1).click();
  assert.equal(await activeTabs.nth(1).getAttribute('aria-selected'), 'true');
  await activeTabs.nth(0).click();
  assert.equal(await reasoning.getAttribute('aria-expanded'), 'true');
  assert.equal(stub.counters.streamRequests, requestsBeforeSwitch);
  assert.equal(stub.counters.abortedRequests || 0, abortedBeforeSwitch);
  await activeTabs.nth(1).click();

  await saveScreenshot(page, 'mobile-streaming');

  // Release and complete generation
  stub.setHoldGenerate(false);
  await page.waitForFunction(
    () => document.querySelectorAll('[aria-busy="true"]').length === 0,
    null,
    { timeout: 15000 },
  );

  // Active tab 1 should have its completed text visible
  const activePanelText = await page.locator('[role="tabpanel"]:not([hidden])').textContent();
  assert.ok(
    activePanelText.length > 50,
    `Active panel should display generated text, got length ${activePanelText.length}`,
  );

  await saveScreenshot(page, 'mobile-success');

  // 4. Tab keyboard navigation (ArrowRight / ArrowLeft / Home / End)
  await activeTabs.nth(1).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await activeTabs.nth(2).getAttribute('aria-selected'), 'true');
  assert.equal(await activeTabs.nth(2).evaluate((e) => e === document.activeElement), true);

  await page.keyboard.press('ArrowRight'); // Wrap to index 0
  assert.equal(await activeTabs.nth(0).getAttribute('aria-selected'), 'true');
  assert.equal(await activeTabs.nth(0).evaluate((e) => e === document.activeElement), true);

  await page.keyboard.press('End');
  assert.equal(await activeTabs.nth(2).getAttribute('aria-selected'), 'true');

  await page.keyboard.press('Home');
  assert.equal(await activeTabs.nth(0).getAttribute('aria-selected'), 'true');

  // 5. Open ModelPicker from mobile "+" button
  const addBtn = page.getByRole('button', { name: 'Добавить модель' }).last();
  await addBtn.click();

  const pickerDialog = page.getByRole('dialog');
  await pickerDialog.waitFor({ state: 'visible' });
  await saveScreenshot(page, 'mobile-picker');

  // Select a 4th model
  const fourthModelBtn = page
    .getByRole('dialog')
    .getByRole('button', { name: /Демо Альфа|Демо Бета/ })
    .first();
  await fourthModelBtn.click();
  await pickerDialog.waitFor({ state: 'hidden' });

  // 4 models now present
  assert.equal(await activeTabs.count(), 4);
  // Active model should have switched to the newly added 4th model
  assert.equal(await activeTabs.nth(3).getAttribute('aria-selected'), 'true');

  // 6. Stop and Retry single cell
  // Send another turn
  await composerInput.fill('Краткое продолжение для проверки Stop и Retry');
  stub.setHoldGenerate(true);
  await page.getByRole('button', { name: 'Отправить вопрос' }).click();
  await stub.waitForActive(4);

  expectRequestFailed('/api/stream');

  // Stop active cell in turn 2
  const cellStopBtn = page.locator('button[class*="cellStopButton"]').last();
  await cellStopBtn.waitFor({ state: 'visible' });
  await cellStopBtn.click();

  // Check stopped status in active panel
  await page.waitForFunction(
    () => document.body.textContent.includes('Генерация остановлена.'),
    null,
    { timeout: 5000 },
  );
  await saveScreenshot(page, 'mobile-stopped');

  // Release the remaining 3 background models
  stub.setHoldGenerate(false);

  // Retry the stopped cell
  const retryStoppedBtn = page.locator('button[data-action="retry"]').last();
  await retryStoppedBtn.click();
  await page.waitForFunction(
    () => document.querySelectorAll('[aria-busy="true"]').length === 0,
    null,
    { timeout: 15000 },
  );

  // Active tab can already be done while Stop all must cancel hidden streams.
  stub.setHoldGenerate(true);
  await composerInput.fill('Stop background streams after resize');
  await page.getByRole('button', { name: 'Отправить вопрос' }).click();
  await stub.waitForActive(4);
  const streamsBeforeResize = stub.counters.streamRequests;
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 1280) await page.getByRole('tablist').last().waitFor({ state: 'visible' });
    else await page.locator('[class*="modelBar"]').waitFor({ state: 'visible' });
    assert.equal(stub.counters.streamRequests, streamsBeforeResize);
    assert.equal(stub.counters.activeRequests, 4);
  }
  stub.sendPartialGenerate('claude-demo');
  stub.releaseGenerate('demo-alpha');
  await stub.waitForActive(3);
  await page
    .locator('[role="tabpanel"]:not([hidden])')
    .last()
    .locator('[class*="metadata"]')
    .waitFor({ state: 'visible' });
  const abortedBeforeAll = stub.counters.abortedRequests || 0;
  for (let i = 0; i < 3; i++) expectRequestFailed('/api/stream');
  await page.getByRole('button', { name: 'Остановить генерацию', exact: true }).click();
  await stub.waitForActive(0);
  assert.equal(stub.counters.abortedRequests, abortedBeforeAll + 3);
  assert.equal(await page.locator('[aria-busy="true"]').count(), 0);
  stub.setHoldGenerate(false);

  // 7. Orientation / Resize test
  // Remove active model in turn 2: focus stays in that turn's selected tab.
  const latestTurn = page
    .locator('section')
    .filter({ has: page.locator('[role="tablist"]') })
    .last();
  await latestTurn.getByRole('button', { name: /Удалить модель/ }).click();
  assert.equal(
    await latestTurn
      .getByRole('tab', { selected: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await latestTurn.getByRole('button', { name: 'Добавить модель', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Демо Альфа|Демо Бета/ })
    .first()
    .click();
  await pickerDialog.waitFor({ state: 'hidden' });
  assert.equal(
    await latestTurn
      .getByRole('tab', { selected: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );

  // Resize must repair focus when the focused tab is unmounted, rather than leave BODY active.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.querySelector('[class*="modelBar"]') !== null);
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
    'Удалить модель Демо Альфа',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await latestTurn.getByRole('tab', { selected: true }).waitFor({ state: 'visible' });
  assert.equal(
    await page
      .getByRole('tab', { selected: true })
      .last()
      .evaluate((node) => node === document.activeElement),
    true,
  );

  // Rotate 390x844 -> 844x390 -> 390x844
  await page.setViewportSize({ width: 844, height: 390 });
  assert.ok(
    (await page.evaluate(() => document.documentElement.scrollWidth)) <= 845,
    'Landscape mobile scrollWidth',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    (await page.evaluate(() => document.documentElement.scrollWidth)) <= 391,
    'Portrait mobile scrollWidth',
  );

  // Resize to desktop 1440px
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopBar = page.locator('[class*="modelBar"]');
  await desktopBar.waitFor({ state: 'visible' });
  await saveScreenshot(page, 'desktop-1440');

  // Resize to tablet 768px
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.locator('[role="tablist"]').first().waitFor({ state: 'visible' });
  await saveScreenshot(page, 'tablet-768');

  // Overflow and tab invariance must be checked with populated answers too.
  const requestCount = stub.counters.streamRequests;
  for (const vp of testViewports) {
    await page.setViewportSize(vp);
    if (vp.width < 1280) {
      await page.getByRole('tablist').first().waitFor({ state: 'visible' });
      const tabs = page.getByRole('tablist').last().getByRole('tab');
      for (let index = 0; index < (await tabs.count()); index++) {
        await tabs.nth(index).click();
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        const remove = await page
          .getByRole('button', { name: /Удалить модель/ })
          .last()
          .boundingBox();
        assert.ok(remove.width >= 44 && remove.height >= 44);
      }
    } else {
      await page.locator('[class*="modelBar"]').waitFor({ state: 'visible' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    assert.equal(stub.counters.streamRequests, requestCount);
  }

  console.log('PASS browser mobile: viewports, tabs, streaming, modal, rotate and resize.');
});
