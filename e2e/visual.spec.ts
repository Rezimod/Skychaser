import { test, expect } from '@playwright/test';

const ROUTES = [
  ['home', '/'],
  ['set-001', '/genesis'],
  ['card-saturn', '/card/SATURN'],
  ['card-halley', '/card/HALLEY'],
  ['collection', '/collection'],
] as const;

const SIZES = [
  ['mobile', 390, 844],
  ['desktop', 1440, 900],
] as const;

for (const [name, path] of ROUTES) {
  for (const [label, width, height] of SIZES) {
    test(`${name} ${label}`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `qa/${name}-${label}.png`, fullPage: true, animations: 'disabled', timeout: 30_000 });

      // nothing may run off the side of a phone
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} ${label} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
}
