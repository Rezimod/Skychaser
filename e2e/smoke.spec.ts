import { test, expect } from '@playwright/test';

/**
 * Golden-path smoke tests. Run on every push.
 * Each test loads a major route, asserts the page rendered without
 * a runtime error, and asserts a stable selector that proves the
 * page-specific UI mounted (not just an empty shell).
 *
 * Keep these few and stable. They exist to catch regressions like
 * "build still passes but / 500s" or "sky page crashes on first paint."
 */

test.describe('smoke — golden routes', () => {
  test('home page renders the landing + Skychaser nav', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const response = await page.goto('/');
    expect(response?.ok()).toBeTruthy();

    const nav = page.getByRole('navigation', { name: 'Skychaser' });
    await expect(nav.getByRole('link', { name: 'Genesis', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Tonight', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hold a piece of the cosmos');
    await expect(page.getByRole('link', { name: /Detonate a star/ }).first()).toHaveAttribute('href', '/genesis');

    expect(errors, `pageerrors on /: ${errors.join('\n')}`).toEqual([]);
  });
});
