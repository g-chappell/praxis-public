import { expect, test } from '@playwright/test';

// Smoke test: the dashboard renders with no sign-in (local single-user build).
test('dashboard loads without authentication', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible();
});
