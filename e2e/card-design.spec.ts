import { test, expect, type Locator } from '@playwright/test';

const imagesLoaded = async (scope: Locator) => {
  await expect.poll(() => scope.locator('img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await scope.locator('img').evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode())));
  await scope.page().evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
};

test('browse, turn, navigate and filter the Genesis cards', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/genesis', { waitUntil: 'domcontentloaded' });
  const imilac = page.locator('.sd-tile[data-zoom="IMILAC"]');
  await expect(imilac).toBeVisible();
  await page.screenshot({ path: 'qa/genesis-desktop.png' });
  await imilac.click();
  const dialog = page.getByRole('dialog', { name: 'IMILAC', exact: true });
  await expect(dialog).toBeVisible();
  await imagesLoaded(dialog);
  await page.screenshot({ path: 'qa/card-front-desktop.png' });
  await page.keyboard.press('f');
  await expect(dialog.getByRole('button', { name: /Tap to turn it over/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('Field notes')).toBeVisible();
  await imagesLoaded(dialog);
  await page.screenshot({ path: 'qa/card-back-desktop.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#sd-zoom-name')).not.toHaveText('IMILAC');
  await expect(page.getByRole('button', { name: /Tap to turn it over/ })).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(imilac).toBeFocused();

  await page.getByRole('button', { name: 'Epic', exact: true }).click();
  await expect(page.locator('[data-shelf-item]:not([hidden])')).not.toHaveCount(0);
  await expect(page.locator('[data-shelf-item]:not([hidden]):not([data-rarity="epic"])')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search the set' }).fill('Earth');
  await expect(page.locator('[data-shelf-item]:not([hidden])')).toHaveCount(1);
  await page.getByRole('searchbox').fill('no-such-object');
  await expect(page.getByText('No cards match. Try another name or rarity.')).toBeVisible();
  await page.getByRole('searchbox').clear();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'qa/genesis-mobile.png', fullPage: false });
  await imilac.click();
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'qa/card-mobile.png' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('every card has a legible back inside its frame', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/genesis', { waitUntil: 'domcontentloaded' });
  const tiles = page.locator('.sd-tile[data-zoom]');
  const total = await tiles.count();
  await tiles.first().click();
  for (let index = 0; index < total; index++) {
    await page.keyboard.press('f');
    const back = page.locator('.sd-zoom .sdc-card--back');
    await expect(back).toBeVisible();
    const bounds = await back.evaluate((element) => {
      const frame = element.getBoundingClientRect();
      const footer = element.querySelector('.sdc-notes__foot')!.getBoundingClientRect();
      const story = element.querySelector('.sdc-notes__story')!.getBoundingClientRect();
      return { name: element.querySelector('.sdc-notes__name')!.textContent, fits: footer.bottom < frame.bottom && story.bottom < footer.top };
    });
    expect(bounds.fits, `${bounds.name}: field notes overflow`).toBe(true);
    if (index < total - 1) await page.keyboard.press('ArrowRight');
  }
});
