import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

// Terminal e2e for project-team selection (STORY-57/TASK-177): a user in two
// teams creates a project, picks the non-default team in the selector, and the
// project shows on the dashboard labelled with that team's name.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('choose a team when creating a project', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('pick a team on create → the project is labelled with that team', async ({ page }) => {
    const stamp = Date.now();
    const alpha = `Alpha ${stamp}`;
    const beta = `Beta ${stamp}`;

    // 1. Sign in via the magic link.
    const email = `pts-${stamp}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Create two teams (Beta last → most-recent → preselected in the selector).
    for (const name of [alpha, beta]) {
      const res = await page.request.post('/api/teams', { data: { name } });
      expect(res.ok()).toBeTruthy();
    }

    // 3. Open the create form; the selector lists both, Beta preselected.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new project/i }).click();
    const select = page.getByTestId('create-project-team-select');
    await expect(select).toBeVisible({ timeout: 10_000 });
    await expect(select).toHaveValue(/.+/);

    // 4. Pick Alpha (the non-default) and create.
    await select.selectOption({ label: alpha });
    await page.getByPlaceholder('Untitled project').fill('Team-scoped build');
    await page.getByRole('button', { name: /create project/i }).click();
    await page.waitForURL(/\/projects\//, { timeout: 30_000 });

    // 5. The dashboard shows the project labelled with the chosen team (Alpha).
    await page.goto('/dashboard');
    await expect(page.getByText('Team-scoped build')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('project-team-label').first()).toContainText(alpha);
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
      // .mail/ may not exist yet; keep polling.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`timed out waiting for magic-link email to ${forEmail}`);
}
