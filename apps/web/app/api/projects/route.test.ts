// Unit tests for POST /api/projects (STORY-57). Mocks the auth + lib + db
// boundaries to exercise the teamId resolution → status mapping: a member's
// teamId creates under it, a non-member teamId 403s, zero teams 409s.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const resolveCreateTeam = vi.fn();
const returning = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/projects', () => ({
  resolveCreateTeam: (...a: unknown[]) => resolveCreateTeam(...a),
  parseProjectStatus: () => 'active',
  parseProjectSort: () => 'recent',
  listUserProjects: vi.fn(),
}));
vi.mock('@/lib/templates', () => ({
  isTemplateId: () => true,
  DEFAULT_TEMPLATE_ID: 'react-threejs-scene',
}));
vi.mock('@praxis/db', () => ({ projects: {} }));
vi.mock('@praxis/db/client', () => ({
  db: { insert: () => ({ values: () => ({ returning: () => returning() }) }) },
}));

import { POST } from './route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('POST /api/projects', () => {
  it('401 when signed out', async () => {
    getSession.mockResolvedValue(null);
    expect((await post({ name: 'P' })).status).toBe(401);
    expect(resolveCreateTeam).not.toHaveBeenCalled();
  });

  it('creates under the resolved team and returns its id', async () => {
    resolveCreateTeam.mockResolvedValue({ teamId: 'team-b' });
    returning.mockResolvedValue([{ id: 'proj-1' }]);
    const res = await post({ name: 'P', teamId: 'team-b' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'proj-1' });
    expect(resolveCreateTeam).toHaveBeenCalledWith('user-1', 'team-b');
  });

  it('403 for a team the user does not belong to — creates nothing', async () => {
    resolveCreateTeam.mockResolvedValue({ error: 'forbidden' });
    const res = await post({ name: 'P', teamId: 'foreign' });
    expect(res.status).toBe(403);
    expect(returning).not.toHaveBeenCalled();
  });

  it('409 needs_team for a teamless user', async () => {
    resolveCreateTeam.mockResolvedValue({ error: 'needs_team' });
    const res = await post({ name: 'P' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'needs_team' });
    expect(resolveCreateTeam).toHaveBeenCalledWith('user-1', undefined);
  });
});
