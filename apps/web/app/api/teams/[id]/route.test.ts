// Unit tests for PATCH /api/teams/[id] (STORY-54). Mocks the auth + lib
// boundaries to exercise auth-gating and the rename-result → status mapping.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const renameTeam = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/teams', () => ({ renameTeam: (...a: unknown[]) => renameTeam(...a) }));

import { PATCH } from './route';

const params = { params: { id: 'team-1' } };
function patch(body: unknown) {
  return PATCH(
    new Request('http://localhost/api/teams/team-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    params as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'user-1' } });
});

describe('PATCH /api/teams/[id]', () => {
  it('401 when signed out — never renames', async () => {
    getSession.mockResolvedValue(null);
    const res = await patch({ name: 'Acme Labs' });
    expect(res.status).toBe(401);
    expect(renameTeam).not.toHaveBeenCalled();
  });

  it('200 with the team on success', async () => {
    const team = { id: 'team-1', name: 'Acme Labs', isOwner: true, members: [] };
    renameTeam.mockResolvedValue({ team });
    const res = await patch({ name: 'Acme Labs' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ team });
    expect(renameTeam).toHaveBeenCalledWith('user-1', 'team-1', 'Acme Labs');
  });

  it('403 for a non-owner', async () => {
    renameTeam.mockResolvedValue({ error: 'not_owner' });
    expect((await patch({ name: 'Hijacked' })).status).toBe(403);
  });

  it('404 for an unknown team', async () => {
    renameTeam.mockResolvedValue({ error: 'not_found' });
    expect((await patch({ name: 'Ghost' })).status).toBe(404);
  });

  it('400 for an invalid name', async () => {
    renameTeam.mockResolvedValue({ error: 'invalid_name' });
    expect((await patch({ name: '   ' })).status).toBe(400);
  });
});
