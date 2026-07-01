import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ensureTeam } from './teams';

// Smoke e2e for project duplicate (STORY-42/TASK-121): an authenticated owner
// sees the Duplicate control on an active project row. The full clone round-trip
// (copy → open → files present → editing the copy doesn't change the source)
// needs a live orchestrator + Docker, which the e2e env doesn't run — it's
// verified by the Docker-gated DockerSandbox.clone test and on the deployed VPS
// (the same live-only split control-modes.spec.ts uses).

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('project duplicate', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('owner sees the Duplicate control on an active project', async ({ page }) => {
    const email = `dup-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    await ensureTeam(page.request);
    const res = await page.request.post('/api/projects', { data: { name: 'Duplicate me' } });
    expect(res.ok()).toBeTruthy();

    await page.goto('/dashboard');
    await expect(page.getByText('Duplicate me')).toBeVisible({ timeout: 30_000 });
    const dup = page.getByTestId('duplicate-project-button');
    await expect(dup).toBeVisible();
    await expect(dup).toBeEnabled();
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
