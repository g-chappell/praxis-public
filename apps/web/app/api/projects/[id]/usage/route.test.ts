// Unit tests for GET /api/projects/[id]/usage (STORY-22): auth + membership gate.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const projectUsage = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/usage', () => ({ projectUsage: (...a: unknown[]) => projectUsage(...a) }));

import { GET } from './route';

const params = { params: { id: 'p1' } };
const callGet = () =>
  GET(new Request('http://localhost/api/projects/p1/usage') as never, params as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  projectUsage.mockResolvedValue({
    inputTokens: 10,
    outputTokens: 5,
    estimatedCostUsd: 0.1,
    turns: 1,
  });
});

describe('GET /api/projects/[id]/usage', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    expect((await callGet()).status).toBe(401);
    expect(projectUsage).not.toHaveBeenCalled();
  });

  it('403 when not a member (projectUsage null)', async () => {
    projectUsage.mockResolvedValue(null);
    expect((await callGet()).status).toBe(403);
  });

  it('200 returns the usage summary for a member', async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      estimatedCostUsd: 0.1,
      turns: 1,
    });
    expect(projectUsage).toHaveBeenCalledWith('u1', 'p1');
  });
});
