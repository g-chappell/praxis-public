// Unit tests for GET /api/admin/projects (STORY-44). Mocks the auth/admin/lib
// boundaries to exercise role-gating (401/403) and the admin happy path, plus
// that ?q/?sort/?status are forwarded to adminListProjects.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminListProjects = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-projects', () => ({
  adminListProjects: (...a: unknown[]) => adminListProjects(...a),
  parseAdminProjectSort: (v: unknown) =>
    v === 'oldest' || v === 'name' || v === 'activity' ? v : 'recent',
}));

import { GET } from './route';

const callGet = (url: string) => GET(new Request(url) as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminListProjects.mockResolvedValue([]);
});

describe('GET /api/admin/projects', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    const res = await callGet('http://localhost/api/admin/projects');
    expect(res.status).toBe(401);
    expect(adminListProjects).not.toHaveBeenCalled();
  });

  it('403 for a non-admin (never lists)', async () => {
    isUserAdmin.mockResolvedValue(false);
    const res = await callGet('http://localhost/api/admin/projects');
    expect(res.status).toBe(403);
    expect(adminListProjects).not.toHaveBeenCalled();
  });

  it('200 for an admin returns the project list', async () => {
    adminListProjects.mockResolvedValue([{ id: 'p1', name: 'P', memberCount: 2 }]);
    const res = await callGet('http://localhost/api/admin/projects');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [{ id: 'p1', name: 'P', memberCount: 2 }] });
  });

  it('forwards ?q, ?sort and ?status to the lib', async () => {
    await callGet('http://localhost/api/admin/projects?q=ada&sort=name&status=archived');
    expect(adminListProjects).toHaveBeenCalledWith({ q: 'ada', sort: 'name', status: 'archived' });
  });
});
