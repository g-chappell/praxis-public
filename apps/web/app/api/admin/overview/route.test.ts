// Unit tests for GET /api/admin/overview (STORY-48): role-gating + happy path.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminOverview = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-overview', () => ({
  adminOverview: (...a: unknown[]) => adminOverview(...a),
}));

import { GET } from './route';

const callGet = () => GET();

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminOverview.mockResolvedValue({ counts: { users: 2 }, keys: [], recentActions: [] });
});

describe('GET /api/admin/overview', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    expect((await callGet()).status).toBe(401);
    expect(adminOverview).not.toHaveBeenCalled();
  });

  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await callGet()).status).toBe(403);
    expect(adminOverview).not.toHaveBeenCalled();
  });

  it('200 returns the overview aggregate', async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counts: { users: 2 }, keys: [], recentActions: [] });
  });
});
