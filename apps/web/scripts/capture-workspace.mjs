// Capture a screenshot of the running app for the README.
//
// Prereqs (once): the app is running locally (`pnpm dev` or docker compose), and
// Playwright's chromium is installed:
//   pnpm --filter @praxis/web exec playwright install chromium
//
// Usage — open the workspace you want to capture in your browser first (prompt
// the agent so the chat + preview have content), copy its URL, then:
//   cd apps/web
//   node scripts/capture-workspace.mjs "http://localhost:3000/projects/<id>" ../../docs/images/workspace.png
//
// Defaults: the dashboard, written to docs/images/workspace.png.
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:3000/dashboard';
const out = process.argv[3] ?? '../../docs/images/workspace.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: 'networkidle' });
// Give the workspace a moment to connect its socket and render the panes
// (the file tree, editor, and preview stream in after the session is ready).
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
