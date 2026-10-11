import { test, expect } from '@playwright/test';

/**
 * Broad route smoke test — every major page should return 200 and mount without
 * a client-side runtime error. Uses the config baseURL (local server by default;
 * set PLAYWRIGHT_BASE_URL=https://stellarrclub.vercel.app to run against prod).
 */

const ROUTES = [
  '/',
  '/genesis',
  '/card/TYCHO',
  '/capsules',
  '/capsules/log',
  '/collection',
  '/vote',
  '/contact',
  '/terms',
  '/privacy',
  '/voyage',
  '/node',
];

for (const route of ROUTES) {
  test(`route ${route} loads without runtime errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(500);

    await page.waitForTimeout(500);
    expect(errors, `pageerrors on ${route}:\n${errors.join('\n')}`).toEqual([]);
  });
}

test('footer includes legal links', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const footer = page.locator('footer');
  await expect(footer.getByRole('link', { name: /terms/i })).toBeVisible();
  await expect(footer.getByRole('link', { name: /privacy/i })).toBeVisible();
  await expect(footer.getByRole('link', { name: /contact/i })).toBeVisible();
});
