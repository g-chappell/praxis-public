import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

// Smoke e2e for owning multiple teams (STORY-55/TASK-169): a user creates two
// teams from /settings, sees both as separate cards (owner of each, members
// listed by name), and renaming one leaves the other untouched.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('own multiple teams', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('create two teams; each card lists its members; renaming one leaves the other', async ({
    page,
  }) => {
    // 1. Sign in via the magic link.
    const email = `multi-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Settings: empty Teams panel with a create form and no team card.
    await page.goto('/settings');
    await expect(page.getByTestId('teams-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('team-card')).toHaveCount(0);

    // 3. Create team Alpha.
    await page.getByTestId('team-name-input').fill('Alpha');
    await page.getByTestId('team-create-submit').click();
    const alpha = page.getByTestId('team-card').filter({ hasText: 'Alpha' });
    await expect(alpha).toBeVisible({ timeout: 30_000 });

    // 4. Create a second team Beta — the create form stays available.
    await page.getByTestId('team-name-input').fill('Beta');
    await page.getByTestId('team-create-submit').click();
    const beta = page.getByTestId('team-card').filter({ hasText: 'Beta' });
    await expect(beta).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('team-card')).toHaveCount(2);

    // 5. Owner of both, and each card lists the user (by name/email) as a member.
    await expect(alpha.getByTestId('team-member-owner-badge')).toBeVisible();
    await expect(beta.getByTestId('team-member-owner-badge')).toBeVisible();
    await expect(alpha.getByTestId('team-member-row').filter({ hasText: email })).toBeVisible();
    await expect(beta.getByTestId('team-member-row').filter({ hasText: email })).toBeVisible();

    // 6. Rename Beta -> Beta Labs (await the PATCH so the reload can't race it).
    await beta.getByTestId('team-rename-input').fill('Beta Labs');
    const [renameRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/teams/') && r.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      beta.getByTestId('team-rename-save').click(),
    ]);
    expect(renameRes.ok()).toBeTruthy();

    // 7. After reload: Beta renamed, Alpha untouched.
    await page.reload();
    await expect(page.getByTestId('team-card').filter({ hasText: 'Beta Labs' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('team-card').filter({ hasText: 'Alpha' })).toBeVisible();
    await expect(page.getByTestId('team-card')).toHaveCount(2);
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
