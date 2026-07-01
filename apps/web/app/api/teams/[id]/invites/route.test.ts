// Unit tests for POST /api/teams/[id]/invites (STORY-56). Mocks the auth + lib
// boundaries to exercise auth-gating, the result → status mapping, and the URL
// built from the forwarded host.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const createTeamInvite = vi.fn();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ host: 'praxis.local' })),
}));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/invites', () => ({ createTeamInvite: (...a: unknown[]) => createTeamInvite(...a) }));

import { POST } from './route';

const params = { params: { id: 'team-1' } };
function post() {
  return POST(
    new Request('http://localhost/api/teams/team-1/invites', { method: 'POST' }) as never,
    params as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'owner-1' } });
});

describe('POST /api/teams/[id]/invites', () => {
  it('401 when signed out — never mints', async () => {
    getSession.mockResolvedValue(null);
    expect((await post()).status).toBe(401);
    expect(createTeamInvite).not.toHaveBeenCalled();
  });

  it('200 with code + url built from the forwarded host', async () => {
    const expiresAt = new Date('2026-07-01T00:00:00Z');
    createTeamInvite.mockResolvedValue({ invite: { code: 'abc123', expiresAt } });
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      code: 'abc123',
      url: 'https://praxis.local/invite/abc123',
    });
    expect(createTeamInvite).toHaveBeenCalledWith('owner-1', 'team-1');
  });

  it('403 for a non-owner', async () => {
    createTeamInvite.mockResolvedValue({ error: 'not_owner' });
    expect((await post()).status).toBe(403);
  });

  it('409 when the team is full', async () => {
    createTeamInvite.mockResolvedValue({ error: 'team_full' });
    expect((await post()).status).toBe(409);
  });

  it('404 for an unknown team', async () => {
    createTeamInvite.mockResolvedValue({ error: 'not_found' });
    expect((await post()).status).toBe(404);
  });
});
