// Route tests for the git data API (TASK-045). Node-compatible: ../runtime is
// mocked to supply a live room + a fake exec sandbox, so the real ../git parsing
// runs end-to-end through the Hono handlers without Docker.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExecResult } from '@praxis/sandbox';

const { getRoomByProject, exec } = vi.hoisted(() => ({
  getRoomByProject: vi.fn(),
  exec: vi.fn(),
}));

vi.mock('../src/runtime', () => ({
  getRoomByProject,
  getSandbox: () => ({ exec }),
}));

import { gitRoute } from '../src/routes/git';

const SECRET = 'test-secret';
const HDR = { 'x-internal-secret': SECRET };

function execResult(stdout = '', exitCode = 0, stderr = ''): ExecResult {
  return { stdout, exitCode, stderr };
}

beforeEach(() => {
  process.env.ORCHESTRATOR_INTERNAL_SECRET = SECRET;
  getRoomByProject.mockReset().mockReturnValue({ handle: { projectId: 'p1', containerId: 'c1' } });
  exec.mockReset();
});
afterEach(() => {
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
});

describe('git routes — auth + session gates', () => {
  it('rejects without the internal secret (403)', async () => {
    const res = await gitRoute.request('/p1/git/branch');
    expect(res.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('returns 409 when no session/room is live', async () => {
    getRoomByProject.mockReturnValueOnce(undefined);
    const res = await gitRoute.request('/p1/git/branch', { headers: HDR });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'no_active_session' });
  });
});

describe('GET /:id/git/branch', () => {
  it('returns the current branch', async () => {
    exec.mockResolvedValue(execResult('main\n'));
    const res = await gitRoute.request('/p1/git/branch', { headers: HDR });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ branch: 'main' });
  });
});

describe('GET /:id/git/log', () => {
  it('returns parsed commits', async () => {
    const FIELD = '\x1f';
    const RECORD = '\x1e';
    exec.mockResolvedValue(
      execResult(`sha1${FIELD}Ada${FIELD}2026-06-06T10:00:00Z${FIELD}hi${RECORD}`),
    );
    const res = await gitRoute.request('/p1/git/log', { headers: HDR });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      commits: [{ sha: 'sha1', author: 'Ada', date: '2026-06-06T10:00:00Z', message: 'hi' }],
    });
  });
});

describe('GET /:id/git/status', () => {
  it('returns branch + entries', async () => {
    exec.mockResolvedValue(execResult('## main\n M a.ts\n'));
    const res = await gitRoute.request('/p1/git/status', { headers: HDR });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ branch: 'main', entries: [{ status: ' M', path: 'a.ts' }] });
  });
});

describe('GET /:id/git/diff', () => {
  it('400s on a missing or invalid revision (before touching the sandbox)', async () => {
    expect((await gitRoute.request('/p1/git/diff?from=HEAD', { headers: HDR })).status).toBe(400);
    const inj = await gitRoute.request('/p1/git/diff?from=a;rm&to=HEAD', { headers: HDR });
    expect(inj.status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('returns per-file old/new content', async () => {
    exec.mockImplementation(async (_h: unknown, cmd: string) => {
      if (cmd.includes('--name-status')) return execResult('M\0a.ts\0');
      if (cmd.includes('--numstat')) return execResult('1\t1\ta.ts\0');
      if (cmd.includes("show 'HEAD~1:a.ts'")) return execResult('old\n');
      if (cmd.includes("show 'HEAD:a.ts'")) return execResult('new\n');
      return execResult();
    });
    const res = await gitRoute.request('/p1/git/diff?from=HEAD~1&to=HEAD', { headers: HDR });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      from: 'HEAD~1',
      to: 'HEAD',
      files: [
        { path: 'a.ts', status: 'M', binary: false, oldContent: 'old\n', newContent: 'new\n' },
      ],
    });
  });

  it('422s on a git command error (e.g. unknown revision)', async () => {
    exec.mockResolvedValue(execResult('', 128, 'fatal: bad revision'));
    const res = await gitRoute.request('/p1/git/diff?from=HEAD~1&to=HEAD', { headers: HDR });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe('git_error');
  });
});

describe('POST /:id/git/revert', () => {
  function post(body: unknown, headers: Record<string, string> = HDR) {
    return gitRoute.request('/p1/git/revert', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('rejects without the internal secret (403)', async () => {
    const res = await post({ to: 'abc123' }, {});
    expect(res.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('400s on a missing/invalid target (before touching the sandbox)', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ to: 'a; rm -rf /' })).status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('409s when no session is live', async () => {
    getRoomByProject.mockReturnValueOnce(undefined);
    expect((await post({ to: 'abc123' })).status).toBe(409);
  });

  it('resets to the target and returns the new HEAD', async () => {
    exec.mockImplementation(async (_h: unknown, cmd: string) => {
      if (cmd.includes('reset --hard')) return execResult('');
      if (cmd.includes('rev-parse HEAD')) return execResult('newhead\n');
      return execResult();
    });
    const res = await post({ to: 'abc123' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, head: 'newhead' });
  });
});
