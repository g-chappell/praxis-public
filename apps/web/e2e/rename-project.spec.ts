import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ensureTeam } from './teams';

// Smoke e2e for project rename / re-describe (STORY-39/TASK-110): an
// authenticated owner edits a project's name + description from the dashboard
// and the change persists across a reload.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('project rename + re-describe', () => {
  test.beforeAll(async ({ request }) => {
    // Pre-warm cold-compiling routes (see magic-link.spec.ts).
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('owner edits name + description; it survives a reload', async ({ page }) => {
    // 1. Sign in via the magic link (same flow as magic-link.spec.ts).
    const email = `rename-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Create a project (owned by this user) via the API. A team is required
    // first (STORY-54 removed auto-create).
    await ensureTeam(page.request);
    const res = await page.request.post('/api/projects', { data: { name: 'Before rename' } });
    expect(res.ok()).toBeTruthy();

    // 3. On the dashboard, this fresh user has exactly one project row.
    await page.goto('/dashboard');
    await expect(page.getByText('Before rename')).toBeVisible({ timeout: 30_000 });

    // 4. Open the inline edit form, change name + description, save.
    const newName = `Renamed ${Date.now()}`;
    const newDescription = 'A three.js scene built in the e2e';
    await page.getByTestId('edit-project-button').click();
    await page.getByTestId('edit-project-name').fill(newName);
    await page.getByTestId('edit-project-description').fill(newDescription);
    await page.getByTestId('edit-project-save').click();

    // 5. The row reflects the new values without a full navigation.
    await expect(page.getByText(newName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(newDescription)).toBeVisible();
    await expect(page.getByText('Before rename')).toHaveCount(0);

    // 6. The change persists across a reload.
    await page.reload();
    await expect(page.getByText(newName)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(newDescription)).toBeVisible();
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
