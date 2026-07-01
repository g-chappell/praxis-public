import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { auditLog, users } from '@praxis/db';
import { withDb } from '@praxis/db/test';
import { expect, test, type Page } from '@playwright/test';
import { and, eq } from 'drizzle-orm';

import { ensureTeam } from './teams';

// Smoke e2e for admin project moderation (STORY-44/TASK-128): an admin opens the
// projects directory, finds a project owned by ANOTHER user, and archives it with
// a required reason — the status flips and an audit_log row is written. Admin
// role is granted directly in the DB (there's no self-promote UI).

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('admin projects moderation', () => {
  test.beforeAll(async ({ request }) => {
    await request.get('/signin'); // pre-warm cold-compiling routes
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('admin lists all projects and archives one with a reason', async ({ browser }) => {
    const stamp = Date.now();
    const projectName = `Moderate me ${stamp}`;

    // 1. Owner signs in and creates a project.
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    await signIn(ownerPage, `owner-${stamp}@test.local`);
    await ensureTeam(ownerPage.request);
    const res = await ownerPage.request.post('/api/projects', { data: { name: projectName } });
    expect(res.ok()).toBeTruthy();
    const { id: projectId } = (await res.json()) as { id: string };
    await ownerCtx.close();

    // 2. A different user signs in and is granted admin in the DB.
    const adminEmail = `admin-${stamp}@test.local`;
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await signIn(adminPage, adminEmail);
    await withDb((db) =>
      db.update(users).set({ role: 'admin' }).where(eq(users.email, adminEmail)),
    );

    // 3. The admin sees the (non-owned) project in the directory.
    await adminPage.goto('/admin/projects');
    await adminPage.getByLabel('Search projects').fill(projectName);
    await expect(adminPage.getByRole('link', { name: projectName })).toBeVisible({
      timeout: 30_000,
    });

    // 4. Open detail and archive with a reason.
    await adminPage.getByRole('link', { name: projectName }).click();
    await adminPage.waitForURL(/\/admin\/projects\/[0-9a-f-]+/);
    await adminPage.getByRole('button', { name: 'Archive' }).click();
    await adminPage.getByLabel('Moderation reason').fill('e2e: TOS violation');
    await adminPage.getByRole('button', { name: 'Confirm' }).click();

    // 5. The action succeeds — the project is now archived (Restore is offered).
    await expect(adminPage.getByRole('button', { name: 'Restore' })).toBeVisible({
      timeout: 15_000,
    });

    // 6. An audit row exists for the admin archive, carrying the reason.
    await expect
      .poll(
        () =>
          withDb(async (db) => {
            const rows = await db
              .select({ metadata: auditLog.metadata })
              .from(auditLog)
              .where(
                and(eq(auditLog.action, 'project.archived'), eq(auditLog.targetId, projectId)),
              );
            return rows.length > 0 &&
              rows.some(
                (r) => (r.metadata as { reason?: string } | null)?.reason === 'e2e: TOS violation',
              )
              ? 'audited'
              : 'missing';
          }),
        { timeout: 15_000 },
      )
      .toBe('audited');

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
