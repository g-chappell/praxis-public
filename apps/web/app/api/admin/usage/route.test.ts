// Unit tests for GET /api/admin/usage (STORY-49): role-gating + window forwarding.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminUsageOverview = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-usage', () => ({
  adminUsageOverview: (...a: unknown[]) => adminUsageOverview(...a),
}));

import { GET } from './route';

const callGet = (qs = '') => GET(new Request(`http://localhost/api/admin/usage${qs}`) as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminUsageOverview.mockResolvedValue({ total: {}, byProject: [], byUser: [] });
});

describe('GET /api/admin/usage', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    expect((await callGet()).status).toBe(401);
    expect(adminUsageOverview).not.toHaveBeenCalled();
  });

  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await callGet()).status).toBe(403);
    expect(adminUsageOverview).not.toHaveBeenCalled();
  });

  it('200 returns the overview', async () => {
    adminUsageOverview.mockResolvedValue({ total: { turns: 3 }, byProject: [], byUser: [] });
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: { turns: 3 }, byProject: [], byUser: [] });
  });

  it('forwards a from/to window as Dates', async () => {
    await callGet('?from=2026-06-01&to=2026-06-30');
    const arg = adminUsageOverview.mock.calls[0]![0] as { from: Date; to: Date };
    expect(arg.from).toBeInstanceOf(Date);
    expect(arg.to).toBeInstanceOf(Date);
  });

  it('ignores an invalid date', async () => {
    await callGet('?from=not-a-date');
    expect(adminUsageOverview).toHaveBeenCalledWith({ from: undefined, to: undefined });
  });
});
