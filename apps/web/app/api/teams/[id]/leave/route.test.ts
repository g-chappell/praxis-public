// Unit tests for POST /api/teams/[id]/leave (STORY-56). Mocks the auth + lib
// boundaries to exercise auth-gating and the result → status mapping.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const leaveTeam = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/teams', () => ({ leaveTeam: (...a: unknown[]) => leaveTeam(...a) }));

import { POST } from './route';

const params = { params: { id: 'team-1' } };
function leave() {
  return POST(
    new Request('http://localhost/api/teams/team-1/leave', { method: 'POST' }) as never,
    params as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'partner-1' } });
});

describe('POST /api/teams/[id]/leave', () => {
  it('401 when signed out — never leaves', async () => {
    getSession.mockResolvedValue(null);
    expect((await leave()).status).toBe(401);
    expect(leaveTeam).not.toHaveBeenCalled();
  });

  it('200 on success', async () => {
    leaveTeam.mockResolvedValue({ ok: true });
    const res = await leave();
    expect(res.status).toBe(200);
    expect(leaveTeam).toHaveBeenCalledWith('partner-1', 'team-1');
  });

  it('409 when the owner tries to leave', async () => {
    leaveTeam.mockResolvedValue({ error: 'owner_cannot_leave' });
    expect((await leave()).status).toBe(409);
  });

  it('404 for an unknown team', async () => {
    leaveTeam.mockResolvedValue({ error: 'not_found' });
    expect((await leave()).status).toBe(404);
  });
});
