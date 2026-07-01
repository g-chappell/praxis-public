import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { users } from '@praxis/db';
import { withDb } from '@praxis/db/test';
import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';

// Smoke e2e for ban + blocklist enforcement (STORY-46/TASK-137). An admin bans a
// user (their new magic-link sign-in is rejected with no email), and blocklists an
// email (a request for it is rejected with no email). Both gates fire in
// sendMagicLink (lib/auth.ts) before any email is sent.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('ban + blocklist enforcement', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test('banned user is rejected and a blocklisted email gets no link', async ({ browser }) => {
    const stamp = Date.now();

    // A member signs in (exists), then an admin signs in + is granted admin.
    const memberEmail = `banned-${stamp}@test.local`;
    const memberCtx = await browser.newContext();
    await signIn(await memberCtx.newPage(), memberEmail);
    await memberCtx.close();

    const adminEmail = `banadmin-${stamp}@test.local`;
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, adminEmail);
    await withDb((db) =>
      db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail)),
    );
    const memberId = await withDb(async (db) => {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, memberEmail));
      return u!.id;
    });

    // Admin bans the member and blocklists a separate email (via the admin API).
    const blockedEmail = `blocked-${stamp}@spam.test`;
    expect(
      (
        await adminPage.request.patch(`/api/admin/users/${memberId}`, {
          data: { banned: true, reason: 'e2e abuse' },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await adminPage.request.post('/api/admin/blocklist', { data: { value: blockedEmail } })
      ).ok(),
    ).toBeTruthy();
    await adminCtx.close();

    // Banned member: a fresh sign-in attempt is rejected, with no email sent.
    await rm(MAIL_DIR, { recursive: true, force: true });
    await expectSignInRejected(
      await (await browser.newContext()).newPage(),
      memberEmail,
      /suspended/i,
    );
    expect(await mailExistsFor(memberEmail)).toBe(false);

    // Blocklisted email: rejected, no email sent.
    await expectSignInRejected(
      await (await browser.newContext()).newPage(),
      blockedEmail,
      /permitted/i,
    );
    expect(await mailExistsFor(blockedEmail)).toBe(false);
  });
});

/** Submit the magic-link form and assert it's rejected (error shown, no redirect
 *  to the check-email page). */
async function expectSignInRejected(page: Page, email: string, message: RegExp): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /email me a link/i }).click();
  await expect(page.getByText(message)).toBeVisible({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/\/signin\/check-email/);
}

async function mailExistsFor(email: string): Promise<boolean> {
  try {
    const files = await readdir(MAIL_DIR);
    return files.some((f) => f.endsWith(`${email}.html`));
  } catch {
    return false;
  }
}

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
        const { readFile } = await import('node:fs/promises');
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
