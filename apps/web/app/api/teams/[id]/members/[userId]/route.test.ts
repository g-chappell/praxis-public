// Unit tests for DELETE /api/teams/[id]/members/[userId] (STORY-56). Mocks the
// auth + lib boundaries to exercise auth-gating and the result → status mapping.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const removeMember = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/teams', () => ({ removeMember: (...a: unknown[]) => removeMember(...a) }));

import { DELETE } from './route';

const params = { params: { id: 'team-1', userId: 'partner-1' } };
function del() {
  return DELETE(
    new Request('http://localhost/api/teams/team-1/members/partner-1', {
      method: 'DELETE',
    }) as never,
    params as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'owner-1' } });
});

describe('DELETE /api/teams/[id]/members/[userId]', () => {
  it('401 when signed out — never removes', async () => {
    getSession.mockResolvedValue(null);
    expect((await del()).status).toBe(401);
    expect(removeMember).not.toHaveBeenCalled();
  });

  it('200 on success', async () => {
    removeMember.mockResolvedValue({ ok: true });
    const res = await del();
    expect(res.status).toBe(200);
    expect(removeMember).toHaveBeenCalledWith('owner-1', 'team-1', 'partner-1');
  });

  it('403 for a non-owner', async () => {
    removeMember.mockResolvedValue({ error: 'not_owner' });
    expect((await del()).status).toBe(403);
  });

  it('404 for an unknown team', async () => {
    removeMember.mockResolvedValue({ error: 'not_found' });
    expect((await del()).status).toBe(404);
  });

  it('400 when refusing to remove the owner', async () => {
    removeMember.mockResolvedValue({ error: 'cannot_remove_owner' });
    expect((await del()).status).toBe(400);
  });
});
