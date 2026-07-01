import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { ensureTeam } from './teams';

// Smoke e2e for prompt-control modes (STORY-34/TASK-096): an authenticated owner
// opens their project workspace and the ControlBar is mounted, showing the active
// mode. The full two-user handoff (request → approve → prompt → release) and
// serialised queue drain need a real second user + a live agent, so they're
// verified on the deployed app per the deploy-layer-live convention; the control
// state machine + UI are unit-tested in services/orchestrator + components.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('prompt-control modes', () => {
  test.beforeAll(async ({ request }) => {
    // Pre-warm cold-compiling routes (see magic-link.spec.ts).
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('owner sees the control bar with the active mode on the workspace', async ({ page }) => {
    // 1. Sign in via the magic link (same flow as magic-link.spec.ts).
    const email = `ctl-${Date.now()}@test.local`;
    await page.goto('/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    const verifyUrl = await pollForMagicLink(email);
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2. Create a project (owned by this user) via the API, using the page's
    //    authenticated cookies. A team is required first (STORY-54).
    await ensureTeam(page.request);
    const res = await page.request.post('/api/projects', { data: { name: 'Control modes e2e' } });
    expect(res.ok()).toBeTruthy();
    const { id } = (await res.json()) as { id: string };
    expect(id).toBeTruthy();

    // 3. Open the workspace and assert the ControlBar mounted with the mode. (The
    //    orchestrator WS isn't configured in the e2e env, so the control state is
    //    the default 'serialised' — enough to confirm the bar renders in-shell.)
    await page.goto(`/projects/${id}`);
    await expect(page.getByText('Mode')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Anyone')).toBeVisible();
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
