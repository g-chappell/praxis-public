// Unit tests for PATCH/DELETE /api/admin/projects/[id] (STORY-44). Mocks the
// auth/admin/lib/audit boundaries (and the orchestrator fetch) to exercise
// role-gating, the required reason, and the audit-with-reason on success.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminSetProjectArchived = vi.fn();
const adminDeleteProject = vi.fn();
const adminSetProjectBudget = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-projects', () => ({
  adminSetProjectArchived: (...a: unknown[]) => adminSetProjectArchived(...a),
  adminDeleteProject: (...a: unknown[]) => adminDeleteProject(...a),
  adminSetProjectBudget: (...a: unknown[]) => adminSetProjectBudget(...a),
}));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));

import { DELETE, PATCH } from './route';

const params = { params: { id: 'proj-1' } };
function patch(body: unknown) {
  return PATCH(
    new Request('http://localhost/api/admin/projects/proj-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    params as never,
  );
}
function del(body: unknown) {
  return DELETE(
    new Request('http://localhost/api/admin/projects/proj-1', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    params as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminSetProjectArchived.mockResolvedValue(true);
  adminDeleteProject.mockResolvedValue(true);
  adminSetProjectBudget.mockResolvedValue(true);
  process.env.ORCHESTRATOR_INTERNAL_URL = 'http://orch:4001';
  process.env.ORCHESTRATOR_INTERNAL_SECRET = 'secret';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 200 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('PATCH /api/admin/projects/[id] (admin budget override)', () => {
  it('sets the budget (no reason required) and audits', async () => {
    const res = await patch({ budgetUsd: 50 });
    expect(res.status).toBe(200);
    expect(adminSetProjectBudget).toHaveBeenCalledWith('proj-1', '50.00');
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'project.updated',
      expect.objectContaining({ metadata: expect.objectContaining({ budgetUsd: '50.00' }) }),
    );
  });

  it('400 for an invalid budget', async () => {
    const res = await patch({ budgetUsd: -5 });
    expect(res.status).toBe(400);
    expect(adminSetProjectBudget).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/projects/[id] (admin archive)', () => {
  it('403 for a non-admin — never mutates', async () => {
    isUserAdmin.mockResolvedValue(false);
    const res = await patch({ archived: true, reason: 'spam' });
    expect(res.status).toBe(403);
    expect(adminSetProjectArchived).not.toHaveBeenCalled();
  });

  it('400 when the reason is missing', async () => {
    const res = await patch({ archived: true });
    expect(res.status).toBe(400);
    expect(adminSetProjectArchived).not.toHaveBeenCalled();
  });

  it('archives a non-owned project and audits with the reason', async () => {
    const res = await patch({ archived: true, reason: 'TOS violation' });
    expect(res.status).toBe(200);
    expect(adminSetProjectArchived).toHaveBeenCalledWith('proj-1', true);
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'project.archived',
      expect.objectContaining({
        targetType: 'project',
        targetId: 'proj-1',
        metadata: { reason: 'TOS violation', admin: true },
      }),
    );
  });

  it('404 when the project does not exist', async () => {
    adminSetProjectArchived.mockResolvedValue(false);
    const res = await patch({ archived: true, reason: 'gone' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/projects/[id] (admin delete)', () => {
  it('403 for a non-admin — never destroys', async () => {
    isUserAdmin.mockResolvedValue(false);
    const res = await del({ reason: 'spam' });
    expect(res.status).toBe(403);
    expect(adminDeleteProject).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('400 when the reason is missing', async () => {
    const res = await del({});
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('destroys the sandbox, deletes the row, and audits with the reason', async () => {
    const res = await del({ reason: 'abuse' });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      'http://orch:4001/projects/proj-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(adminDeleteProject).toHaveBeenCalledWith('proj-1');
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'project.deleted',
      expect.objectContaining({ metadata: { reason: 'abuse', admin: true } }),
    );
  });

  it('502 and keeps the row when the sandbox destroy fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const res = await del({ reason: 'abuse' });
    expect(res.status).toBe(502);
    expect(adminDeleteProject).not.toHaveBeenCalled();
  });
});
