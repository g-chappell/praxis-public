// Unit tests for the git proxy route (STORY-16/TASK-046). Mocks auth + ownership
// + the orchestrator fetch to verify the auth gate, subpath whitelist, and
// status/body passthrough — without a running orchestrator.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const userOwnsProject = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/projects', () => ({ userOwnsProject: (...a: unknown[]) => userOwnsProject(...a) }));

import { GET, POST } from './route';

const fetchMock = vi.fn();

function orchestratorJson(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ORCHESTRATOR_INTERNAL_URL = 'http://orch:4001';
  process.env.ORCHESTRATOR_INTERNAL_SECRET = 'secret';
  getSession.mockResolvedValue({ user: { id: 'u1' } });
  userOwnsProject.mockResolvedValue(true);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ORCHESTRATOR_INTERNAL_URL;
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
});

const params = (segments: string[]) => ({ params: { id: 'p1', segments } });
const getReq = (qs = '') => new Request(`http://localhost/api/projects/p1/git/log${qs}`);

describe('git proxy — auth gate', () => {
  it('401 when unauthenticated', async () => {
    getSession.mockResolvedValue(null);
    const res = await GET(getReq(), params(['log']));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('403 when the user does not own the project', async () => {
    userOwnsProject.mockResolvedValue(false);
    const res = await GET(getReq(), params(['log']));
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('git proxy — GET', () => {
  it('404s an unknown / multi-segment subpath without calling the orchestrator', async () => {
    expect((await GET(getReq(), params(['bogus']))).status).toBe(404);
    expect((await GET(getReq(), params(['log', 'x']))).status).toBe(404);
    expect((await GET(getReq(), params(['revert']))).status).toBe(404); // revert is POST-only
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the query string + secret and passes the body through', async () => {
    fetchMock.mockResolvedValue(orchestratorJson({ commits: [] }));
    const res = await GET(getReq('?limit=5'), params(['log']));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ commits: [] });
    const call = fetchMock.mock.calls[0]!;
    const url = call[0];
    const init = call[1] as RequestInit;
    expect(url).toBe('http://orch:4001/projects/p1/git/log?limit=5');
    expect((init as RequestInit).headers).toMatchObject({ 'x-internal-secret': 'secret' });
  });

  it('passes the orchestrator status through (e.g. 409 no active session)', async () => {
    fetchMock.mockResolvedValue(orchestratorJson({ error: 'no_active_session' }, 409));
    const res = await GET(getReq(), params(['status']));
    expect(res.status).toBe(409);
  });

  it('502 when the orchestrator is unreachable', async () => {
    fetchMock.mockResolvedValue(null);
    const res = await GET(getReq(), params(['diff']));
    expect(res.status).toBe(502);
  });

  it('500 when the orchestrator env is unconfigured', async () => {
    delete process.env.ORCHESTRATOR_INTERNAL_URL;
    const res = await GET(getReq(), params(['log']));
    expect(res.status).toBe(500);
  });
});

describe('git proxy — POST revert', () => {
  function postReq(body: unknown) {
    return new Request('http://localhost/api/projects/p1/git/revert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('404s a non-whitelisted POST subpath', async () => {
    expect((await POST(postReq({ to: 'abc' }), params(['log']))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the body + secret and returns the orchestrator result', async () => {
    fetchMock.mockResolvedValue(orchestratorJson({ ok: true, head: 'newhead' }));
    const res = await POST(postReq({ to: 'abc123' }), params(['revert']));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, head: 'newhead' });
    const call = fetchMock.mock.calls[0]!;
    const url = call[0];
    const init = call[1] as RequestInit;
    expect(url).toBe('http://orch:4001/projects/p1/git/revert');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ to: 'abc123' }));
  });
});
