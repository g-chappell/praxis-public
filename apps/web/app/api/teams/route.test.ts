// Unit tests for POST /api/teams (STORY-54/55). Mocks the auth + lib boundaries
// to exercise auth-gating and the create-result → status mapping. A user may own
// multiple teams (STORY-55), so the only error is an invalid name (400).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const createTeam = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/teams', () => ({ createTeam: (...a: unknown[]) => createTeam(...a) }));

import { POST } from './route';

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/teams', {
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

describe('POST /api/teams', () => {
  it('401 when signed out — never creates', async () => {
    getSession.mockResolvedValue(null);
    const res = await post({ name: 'Acme' });
    expect(res.status).toBe(401);
    expect(createTeam).not.toHaveBeenCalled();
  });

  it('201 with the team on success', async () => {
    const team = { id: 't1', name: 'Acme', isOwner: true, members: [] };
    createTeam.mockResolvedValue({ team });
    const res = await post({ name: 'Acme' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ team });
    expect(createTeam).toHaveBeenCalledWith('user-1', 'Acme');
  });

  it('400 for an invalid name', async () => {
    createTeam.mockResolvedValue({ error: 'invalid_name' });
    const res = await post({ name: '   ' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_name' });
  });
});
