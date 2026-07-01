// Unit tests for GET /api/admin/audit (STORY-47): role-gating + filter/pagination
// forwarding.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminQueryAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-audit', () => ({
  adminQueryAudit: (...a: unknown[]) => adminQueryAudit(...a),
  parseAuditAction: (v: unknown) => (v === 'project.deleted' ? 'project.deleted' : undefined),
  parseAuditLimit: (v: unknown) => (typeof v === 'string' && Number(v) > 0 ? Number(v) : 50),
}));

import { GET } from './route';

const callGet = (qs = '') => GET(new Request(`http://localhost/api/admin/audit${qs}`) as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminQueryAudit.mockResolvedValue({ entries: [], total: 0 });
});

describe('GET /api/admin/audit', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    expect((await callGet()).status).toBe(401);
    expect(adminQueryAudit).not.toHaveBeenCalled();
  });

  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await callGet()).status).toBe(403);
    expect(adminQueryAudit).not.toHaveBeenCalled();
  });

  it('200 returns entries + total + paging', async () => {
    adminQueryAudit.mockResolvedValue({ entries: [{ id: 'a1' }], total: 1 });
    const res = await callGet('?limit=25');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [{ id: 'a1' }], total: 1, limit: 25, offset: 0 });
  });

  it('forwards filters (actor, target, action, time, offset)', async () => {
    await callGet(
      '?actor=u1&targetType=project&targetId=p1&action=project.deleted&from=2026-06-01&to=2026-06-30&offset=10',
    );
    expect(adminQueryAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'u1',
        targetType: 'project',
        targetId: 'p1',
        action: 'project.deleted',
        offset: 10,
      }),
    );
    const arg = adminQueryAudit.mock.calls[0]![0] as { from: Date; to: Date };
    expect(arg.from).toBeInstanceOf(Date);
    expect(arg.to).toBeInstanceOf(Date);
  });

  it('ignores an unknown action filter', async () => {
    await callGet('?action=bogus');
    expect(adminQueryAudit).toHaveBeenCalledWith(expect.objectContaining({ action: undefined }));
  });
});
