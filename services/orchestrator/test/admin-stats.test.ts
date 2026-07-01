// In-process Hono test for GET /admin/stats (STORY-48). Mocks the sandbox so the
// running-sandbox count is deterministic, and asserts the internal-secret gate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runningCount = vi.fn();

vi.mock('../src/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/runtime')>();
  return {
    ...actual,
    getSandbox: () => ({ runningCount }),
  };
});

import { app } from '../src/app';

const SECRET = 'test-internal-secret';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ORCHESTRATOR_INTERNAL_SECRET = SECRET;
  runningCount.mockResolvedValue(3);
});
afterEach(() => {
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
});

describe('GET /admin/stats', () => {
  it('403 without the internal secret', async () => {
    const res = await app.request('/admin/stats');
    expect(res.status).toBe(403);
    expect(runningCount).not.toHaveBeenCalled();
  });

  it('403 with a wrong secret', async () => {
    const res = await app.request('/admin/stats', { headers: { 'x-internal-secret': 'nope' } });
    expect(res.status).toBe(403);
  });

  it('returns the running-sandbox count + version info with the secret', async () => {
    const res = await app.request('/admin/stats', { headers: { 'x-internal-secret': SECRET } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runningSandboxes: number; uptimeSec: number };
    expect(body.runningSandboxes).toBe(3);
    expect(typeof body.uptimeSec).toBe('number');
  });

  it('degrades to null runningSandboxes when the sandbox listing fails', async () => {
    runningCount.mockRejectedValue(new Error('docker down'));
    const res = await app.request('/admin/stats', { headers: { 'x-internal-secret': SECRET } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { runningSandboxes: number | null }).runningSandboxes).toBeNull();
  });
});
