import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { auditLog, users } from '@praxis/db';
import { withDb } from '@praxis/db/test';
import { expect, test, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';

// Smoke e2e for admin role management (STORY-45/TASK-132): an admin lists users,
// promotes another user to admin, and is blocked from removing their own admin
// role (self-demotion guard). Admin role is granted directly in the DB.

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('admin users role management', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('admin promotes a user and cannot demote themselves', async ({ browser }) => {
    const stamp = Date.now();

    // 1. A regular user signs in (so they exist in the directory).
    const memberEmail = `member-${stamp}@test.local`;
    const memberCtx = await browser.newContext();
    await signIn(await memberCtx.newPage(), memberEmail);
    await memberCtx.close();

    // 2. A second user signs in and is granted admin in the DB.
    const adminEmail = `admin-${stamp}@test.local`;
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, adminEmail);
    await withDb((db) =>
      db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail)),
    );
    const adminId = await withDb(async (db) => {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail));
      return u!.id;
    });

    // 3. Admin finds the member and promotes them to admin.
    await adminPage.goto('/admin/users');
    await adminPage.getByLabel('Search users').fill(memberEmail);
    await adminPage.getByRole('link', { name: memberEmail }).click();
    await adminPage.waitForURL(/\/admin\/users\/[0-9a-f-]+/);
    await adminPage.getByRole('button', { name: 'Make admin' }).click();
    // After promotion the control flips to "Remove admin".
    await expect(adminPage.getByRole('button', { name: 'Remove admin' })).toBeVisible({
      timeout: 15_000,
    });

    // 4. The role change is audited.
    await expect
      .poll(
        () =>
          withDb(async (db) => {
            const rows = await db
              .select({ id: auditLog.id })
              .from(auditLog)
              .where(eq(auditLog.action, 'user.role_changed'));
            return rows.length;
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    // 5. On their own detail, the admin cannot remove their own admin role.
    await adminPage.goto(`/admin/users/${adminId}`);
    await expect(adminPage.getByRole('button', { name: 'Remove admin' })).toBeDisabled({
      timeout: 15_000,
    });

    await adminCtx.close();
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
