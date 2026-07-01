import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ensureTeam } from './teams';

// Smoke e2e for project archive / restore (STORY-40/TASK-114): an authenticated
// owner archives a project (it leaves the Active list and appears under
// Archived), then restores it (back in Active). The volume-untouched guarantee
// is covered by the lib integration test; here we assert the list round-trip.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('project archive + restore', () => {
  test.beforeAll(async ({ request }) => {
    // Pre-warm cold-compiling routes (see magic-link.spec.ts).
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('owner archives a project then restores it', async ({ page }) => {
    // 1. Sign in via the magic link.
    const email = `archive-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Create a project owned by this fresh user (team required first — STORY-54).
    const projectName = `Archive me ${Date.now()}`;
    await ensureTeam(page.request);
    const res = await page.request.post('/api/projects', { data: { name: projectName } });
    expect(res.ok()).toBeTruthy();

    // 3. It shows under the Active tab.
    await page.goto('/dashboard');
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 30_000 });

    // 4. Archive it (accept the lightweight confirm dialog).
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('archive-project-button').click();

    // 5. Gone from Active.
    await expect(page.getByText(projectName)).toHaveCount(0, { timeout: 10_000 });

    // 6. Present under the Archived tab, with a Restore action.
    await page.getByTestId('tab-archived').click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('restore-project-button')).toBeVisible();

    // 7. Restore → returns to Active.
    await page.getByTestId('restore-project-button').click();
    await expect(page.getByText(projectName)).toHaveCount(0, { timeout: 10_000 });
    await page.getByTestId('tab-active').click();
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  // STORY-52: an archived project is read-only cold storage — opening it renders
  // the ArchivedNotice instead of the live workspace shell (so the agent + editor
  // never mount), and Restore reopens it into the interactive workspace. The
  // sandbox teardown-on-archive + restore-rebuilds-from-snapshot round-trip is
  // proven at the Docker layer (packages/sandbox persistence.test.ts) and the
  // orchestrator archive endpoint (projects-route.test.ts); here we prove the
  // user-facing read-only guard + restore path end-to-end.
  test('an archived project opens read-only; restore returns it to the live workspace', async ({
    page,
  }) => {
    const email = `archived-ro-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    await ensureTeam(page.request);
    const res = await page.request.post('/api/projects', { data: { name: `RO ${Date.now()}` } });
    expect(res.ok()).toBeTruthy();
    const { id } = (await res.json()) as { id: string };
    expect(id).toBeTruthy();

    // Archive via the API (the list round-trip is covered by the test above).
    const archived = await page.request.patch(`/api/projects/${id}`, {
      data: { archived: true },
    });
    expect(archived.ok()).toBeTruthy();

    // Opening it is read-only: the ArchivedNotice renders and the live shell
    // (ControlBar 'Mode') never mounts.
    await page.goto(`/projects/${id}`);
    await expect(page.getByText(/this project is archived/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Mode')).toHaveCount(0);

    // Restore from the notice → reloads into the interactive workspace shell.
    await page.getByRole('button', { name: /restore project/i }).click();
    await expect(page.getByText('Mode')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/this project is archived/i)).toHaveCount(0);
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
