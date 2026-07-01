import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { ensureTeam } from './teams';

// Terminal e2e for managing a pair (STORY-56/TASK-174): the owner mints an
// invite from a team card, a partner accepts and lands on the team's project, a
// 3rd user is refused with team-full, and after the owner removes the partner the
// removed user is bounced from the project. Also asserts the workspace header no
// longer carries an Invite button (settings is the only invite surface now).
//
// Two invites are minted while the team still has room: link A (via the UI) is
// consumed by the partner, link B (via the API) stays valid so the 3rd user hits
// the cap rather than a "used" link.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('manage your pair', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin'); // pre-warm cold-compiling routes
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('invite → accept → cap blocks a 3rd → owner removes → access revoked', async ({
    browser,
  }) => {
    const stamp = Date.now();

    // 1. Owner signs in, makes a team + a project, and mints two invites while
    //    the team still has room (A via the card UI, B via the API).
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signIn(ownerPage, `owner-${stamp}@test.local`);
    await ensureTeam(ownerPage.request);
    const projRes = await ownerPage.request.post('/api/projects', {
      data: { name: `Pair project ${stamp}` },
    });
    expect(projRes.ok()).toBeTruthy();
    const { id: projectId } = (await projRes.json()) as { id: string };

    await ownerPage.goto('/settings');
    await expect(ownerPage.getByTestId('team-card')).toBeVisible({ timeout: 30_000 });
    const renameId = await ownerPage.getByTestId('team-rename-input').getAttribute('id');
    const teamId = renameId!.replace('team-rename-', '');

    // Link A via the UI.
    await ownerPage.getByTestId('team-invite-button').click();
    await expect(ownerPage.getByTestId('team-invite-link')).toBeVisible({ timeout: 10_000 });
    const linkA = await ownerPage.getByTestId('team-invite-link').inputValue();
    expect(linkA).toContain('/invite/');

    // Link B via the API (team still has only the owner, so minting is allowed).
    const bRes = await ownerPage.request.post(`/api/teams/${teamId}/invites`);
    expect(bRes.ok()).toBeTruthy();
    const linkB = ((await bRes.json()) as { url: string }).url;

    // 2. Partner accepts link A → lands on the team's project; the workspace has
    //    no Invite button.
    const partnerCtx = await browser.newContext();
    const partnerPage = await partnerCtx.newPage();
    await signIn(partnerPage, `partner-${stamp}@test.local`);
    await partnerPage.goto(linkA);
    await partnerPage.waitForURL(`**/projects/${projectId}`, { timeout: 30_000 });
    await expect(partnerPage.getByTestId('workspace-invite-button')).toHaveCount(0);

    // 3. A 3rd user accepts link B → the team is full → refused.
    const thirdCtx = await browser.newContext();
    const thirdPage = await thirdCtx.newPage();
    await signIn(thirdPage, `third-${stamp}@test.local`);
    await thirdPage.goto(linkB);
    await expect(thirdPage.getByTestId('invite-error')).toContainText(/full/i, { timeout: 30_000 });

    // 4. Owner removes the partner from the team card (accept the confirm).
    await ownerPage.reload();
    await expect(ownerPage.getByTestId('team-member-row')).toHaveCount(2, { timeout: 30_000 });
    ownerPage.once('dialog', (d) => d.accept());
    await ownerPage.getByTestId('team-member-remove').click();
    await expect(ownerPage.getByTestId('team-member-row')).toHaveCount(1, { timeout: 30_000 });

    // 5. The removed partner is bounced from the project on their next visit.
    await partnerPage.goto(`/projects/${projectId}`);
    await partnerPage.waitForURL(/\/dashboard/, { timeout: 30_000 });

    await ownerCtx.close();
    await partnerCtx.close();
    await thirdCtx.close();
  });
});

/** Sign a fresh user in via the dev-mailer magic link. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /email me a link/i }).click();
  await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
  const verifyUrl = await pollForMagicLink(email);
  await page.goto(verifyUrl);
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

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
