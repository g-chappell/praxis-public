// Unit tests for GET /api/admin/users (STORY-45): role-gating + happy path +
// query forwarding.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminListUsers = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-users', () => ({
  adminListUsers: (...a: unknown[]) => adminListUsers(...a),
  parseAdminUserSort: (v: unknown) => (v === 'oldest' || v === 'email' ? v : 'recent'),
}));

import { GET } from './route';

const callGet = (url: string) => GET(new Request(url) as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminListUsers.mockResolvedValue([]);
});

describe('GET /api/admin/users', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    expect((await callGet('http://localhost/api/admin/users')).status).toBe(401);
    expect(adminListUsers).not.toHaveBeenCalled();
  });

  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await callGet('http://localhost/api/admin/users')).status).toBe(403);
    expect(adminListUsers).not.toHaveBeenCalled();
  });

  it('200 returns the user list', async () => {
    adminListUsers.mockResolvedValue([{ id: 'u1', email: 'a@b.c', role: 'user' }]);
    const res = await callGet('http://localhost/api/admin/users');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: [{ id: 'u1', email: 'a@b.c', role: 'user' }] });
  });

  it('forwards ?q and ?sort', async () => {
    await callGet('http://localhost/api/admin/users?q=ada&sort=email');
    expect(adminListUsers).toHaveBeenCalledWith({ q: 'ada', sort: 'email' });
  });
});
