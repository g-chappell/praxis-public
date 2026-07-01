import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ensureTeam } from './teams';

// Smoke e2e for dashboard search + sort (STORY-41/TASK-116): an authenticated
// owner with several projects searches by name and sorts the list, all
// client-side over the loaded set.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('dashboard search + sort', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('owner searches by name and sorts the list', async ({ page }) => {
    // 1. Sign in.
    const email = `search-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Create three named projects via the API (team required first — STORY-54).
    const stamp = Date.now();
    const apple = `Apple ${stamp}`;
    const banana = `Banana ${stamp}`;
    const cherry = `Cherry ${stamp}`;
    await ensureTeam(page.request);
    for (const name of [banana, apple, cherry]) {
      const res = await page.request.post('/api/projects', { data: { name } });
      expect(res.ok()).toBeTruthy();
    }

    await page.goto('/dashboard');
    await expect(page.getByText(apple)).toBeVisible({ timeout: 30_000 });

    // 3. Search narrows to the one matching name.
    await page.getByTestId('project-search').fill('Banana');
    await expect(page.getByText(banana)).toBeVisible();
    await expect(page.getByText(apple)).toHaveCount(0);
    await expect(page.getByText(cherry)).toHaveCount(0);

    // 4. A non-matching query shows the no-match state.
    await page.getByTestId('project-search').fill('zzzznope');
    await expect(page.getByTestId('projects-no-match')).toBeVisible();

    // 5. Clear search, sort by Name → Apple is the first row.
    await page.getByTestId('project-search').fill('');
    await page.getByTestId('project-sort').selectOption('name');
    const firstRowName = page.locator('ul > li').first().locator('a .font-semibold');
    await expect(firstRowName).toHaveText(apple);
  });
});

async function pollForMagicLink(forEmail: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const files = await readdir(MAIL_DIR);
      const ours = files
        .filter((f) => f.endsWith(`${forEmail}.html`))
        .sort()
        .pop();
      if (ours) {
        const html = await readFile(resolve(MAIL_DIR, ours), 'utf8');
        const match = html.match(HREF_RE);
        if (match) return match[1]!;
      }
    } catch {
      // .mail/ may not exist yet on first iteration; keep polling.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for magic-link email to ${forEmail}`);
}
