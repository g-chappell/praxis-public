// In-process Hono test for GET /health. Runs under Vitest+Node so the
// existing CI doesn't need a Bun install.

import { describe, expect, it } from 'vitest';

import { app } from '../src/app';

describe('GET /health', () => {
  it('returns 200 with ok:true and version info', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      ok: boolean;
      version: string;
      gitSha: string;
      uptimeSec: number;
    };

    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.gitSha).toBe('string');
    expect(typeof body.uptimeSec).toBe('number');
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0);
  });
});
