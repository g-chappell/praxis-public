import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // `next dev` compiles routes on first hit (~15s for /api/auth/[...all]
  // on a cold cache). Cap each test at 2 minutes to absorb that warmup
  // without papering over genuine hangs.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // serial; the magic-link e2e reads .mail/ shared state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `next dev` cold-compiles each route on first hit; we pre-warm the
    // auth route in the spec's beforeAll so the first test isn't paying
    // the compile cost. The webServer.timeout is for the initial /
    // probe, not per-test.
    command: `pnpm sync-monaco && pnpm next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://praxis:praxis@127.0.0.1:5432/praxis',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
    },
  },
});
