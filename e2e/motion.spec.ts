import { test, expect } from '@playwright/test';

test('nothing animates under reduced motion', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ['/', '/genesis', '/card/SATURN', '/capsules']) {
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      matches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      running: document.getAnimations().filter((a) => a.playState === 'running').length,
      hidden: [...document.querySelectorAll('.skychaser section, .skychaser .sd-plate, .skychaser h1, .skychaser h2')].filter(
        (el) => Number(getComputedStyle(el).opacity) < 0.99,
      ).length,
    }));
    console.log(`${path}: ${JSON.stringify(r)}`);
    expect(r.matches, 'emulation active').toBe(true);
    expect(r.running, `${path} still animates`).toBe(0);
    expect(r.hidden, `${path} has content stuck invisible`).toBe(0);
  }
});
