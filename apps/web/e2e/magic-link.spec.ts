import { readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

const MAIL_DIR = resolve(process.cwd(), '.mail');
const HREF_RE = /href="(https?:\/\/[^"]+\/api\/auth\/magic-link\/verify[^"]+)"/;

test.describe('magic-link sign-in', () => {
  // `next dev` compiles routes on first hit. Without pre-warming, the
  // first request through the spec eats 15s+ of compile time which
  // bleeds into the test timeout. We pre-warm /api/auth/* and /signin
  // once before any test runs.
  test.beforeAll(async ({ request }) => {
    await request.get('/signin');
    await request.get('/api/auth/get-session');
  });

  test.beforeEach(async () => {
    // Fresh .mail/ for every test so we know which file is ours.
    await rm(MAIL_DIR, { recursive: true, force: true });
  });

  test('submit email → check-email → click link → /dashboard', async ({ page }) => {
    const email = `e2e-${Date.now()}@test.local`;

    // 1. Visit /signin, fill the form, submit.
    await page.goto('/signin');
    await expect(page.getByRole('heading', { name: /sign in to praxis/i })).toBeVisible();
    await page.getByLabel(/email/i).fill(email);
    await page.getByRole('button', { name: /email me a link/i }).click();

    // 2. Lands on /signin/check-email with the email surfaced.
    // `next dev` cold compile on /api/auth can be ~15s; allow ~30s here.
    await page.waitForURL(/\/signin\/check-email/, { timeout: 30_000 });
    await expect(page.getByText(email)).toBeVisible();

    // 3. Poll .mail/ for the dev-mailer's HTML, extract the verify URL.
    const verifyUrl = await pollForMagicLink(email);
    expect(verifyUrl).toContain('/api/auth/magic-link/verify');

    // 4. Navigate to the verify URL — BA should set the session cookie
    //    and redirect to the callbackURL (/dashboard).
    await page.goto(verifyUrl);
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 5. /dashboard renders (the project list) and the nav shows the signed-in
    //    user — a monogram whose title is their email (the redesign dropped the
    //    plain-text email in favour of the masthead monogram).
    await expect(page.getByRole('heading', { name: /your projects/i })).toBeVisible();
    await expect(page.getByTitle(email)).toBeVisible();
  });

  test('middleware redirects unauthenticated /dashboard → /signin', async ({ page }) => {
    // No session cookie; middleware should bounce to /signin.
    await page.goto('/dashboard');
    await page.waitForURL(/\/signin/);
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
