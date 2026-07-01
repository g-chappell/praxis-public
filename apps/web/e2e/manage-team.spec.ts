import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

// Smoke e2e for team create + manage (STORY-54/TASK-166): a fresh (teamless)
// user is blocked from creating a project with create-or-join-a-team guidance,
// then creates a team from /settings, renames it, and can now create a project;
// the member list shows them as owner.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('create and manage your team', () => {
  test.beforeAll(async ({ request }) => {
    // Pre-warm cold-compiling routes (see magic-link.spec.ts).
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('no team → create → rename → create a project; member list shows owner', async ({
    page,
  }) => {
    // 1. Sign in via the magic link (same flow as magic-link.spec.ts).
    const email = `team-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Teamless: creating a project is blocked with create-or-join guidance.
    await page.getByRole('button', { name: /new project/i }).click();
    const guidance = page.getByTestId('needs-team-guidance');
    await expect(guidance).toBeVisible({ timeout: 10_000 });
    await expect(guidance.getByRole('link', { name: /settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );

    // 3. Settings shows the Teams panel with a create form and no team card yet.
    await page.goto('/settings');
    await expect(page.getByTestId('teams-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('team-create-form')).toBeVisible();
    await expect(page.getByTestId('team-card')).toHaveCount(0);

    // 4. Create the team 'Acme' → the card populates with the user as owner.
    await page.getByTestId('team-name-input').fill('Acme');
    await page.getByTestId('team-create-submit').click();
    await expect(page.getByTestId('team-rename-input')).toHaveValue('Acme', { timeout: 30_000 });
    await expect(page.getByTestId('team-member-owner-badge')).toBeVisible();

    // 5. Rename to 'Acme Labs' → wait for the PATCH to land (so the reload
    //    below can't race an in-flight request), then confirm it persisted.
    await page.getByTestId('team-rename-input').fill('Acme Labs');
    const [renameRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/teams/') && r.request().method() === 'PATCH',
        { timeout: 30_000 },
      ),
      page.getByTestId('team-rename-save').click(),
    ]);
    expect(renameRes.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByTestId('team-rename-input')).toHaveValue('Acme Labs', {
      timeout: 30_000,
    });

    // 6. With a team, the dashboard create flow opens the form, not the guidance.
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new project/i }).click();
    await expect(page.getByPlaceholder('Untitled project')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('needs-team-guidance')).toHaveCount(0);

    // 7. Creating a project now succeeds (asserted via the API to avoid mounting
    //    the live workspace, as the sibling project specs do) and shows on the list.
    const res = await page.request.post('/api/projects', { data: { name: 'First build' } });
    expect(res.ok()).toBeTruthy();
    await page.goto('/dashboard');
    await expect(page.getByText('First build')).toBeVisible({ timeout: 30_000 });
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
