// Read-only git data API for the workspace Git panel (STORY-16/TASK-045):
//   GET /projects/:projectId/git/branch
//   GET /projects/:projectId/git/log[?limit=20]
//   GET /projects/:projectId/git/status
//   GET /projects/:projectId/git/diff?from=<rev>&to=<rev>
//
// Server-to-server only (shared internal secret): the web app authenticates the
// user + verifies project ownership, then proxies here. Git runs in the project's
// live sandbox via Sandbox.exec, so an active session (room) is required — 409
// otherwise. The diff parsing/validation lives in ../git (unit-tested).

import { type Context, Hono } from 'hono';

import { gitBranch, gitDiff, gitLog, gitRevert, gitStatus, GitError, isValidRev } from '../git';
import { logger } from '../logger';
import { getRoomByProject, getSandbox } from '../runtime';

export const gitRoute = new Hono();

function hasSecret(secretHeader: string | undefined): boolean {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  return Boolean(secret) && secretHeader === secret;
}

/** Resolve the live room's sandbox handle, or null when no session is active. */
function handleFor(projectId: string) {
  return getRoomByProject(projectId)?.handle ?? null;
}

gitRoute.get('/:projectId/git/branch', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) return c.json({ error: 'forbidden' }, 403);
  const projectId = c.req.param('projectId');
  const handle = handleFor(projectId);
  if (!handle) return c.json({ error: 'no_active_session' }, 409);
  try {
    return c.json({ branch: await gitBranch(getSandbox(), handle) });
  } catch (err) {
    return gitFailure(c, projectId, 'branch', err);
  }
});

gitRoute.get('/:projectId/git/log', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) return c.json({ error: 'forbidden' }, 403);
  const projectId = c.req.param('projectId');
  const handle = handleFor(projectId);
  if (!handle) return c.json({ error: 'no_active_session' }, 409);
  const limit = Number.parseInt(c.req.query('limit') ?? '20', 10);
  try {
    return c.json({
      commits: await gitLog(getSandbox(), handle, Number.isFinite(limit) ? limit : 20),
    });
  } catch (err) {
    return gitFailure(c, projectId, 'log', err);
  }
});

gitRoute.get('/:projectId/git/status', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) return c.json({ error: 'forbidden' }, 403);
  const projectId = c.req.param('projectId');
  const handle = handleFor(projectId);
  if (!handle) return c.json({ error: 'no_active_session' }, 409);
  try {
    return c.json(await gitStatus(getSandbox(), handle));
  } catch (err) {
    return gitFailure(c, projectId, 'status', err);
  }
});

gitRoute.get('/:projectId/git/diff', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) return c.json({ error: 'forbidden' }, 403);
  const projectId = c.req.param('projectId');
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to || !isValidRev(from) || !isValidRev(to)) {
    return c.json({ error: 'bad_request' }, 400);
  }
  const handle = handleFor(projectId);
  if (!handle) return c.json({ error: 'no_active_session' }, 409);
  try {
    return c.json(await gitDiff(getSandbox(), handle, from, to));
  } catch (err) {
    return gitFailure(c, projectId, 'diff', err);
  }
});

gitRoute.post('/:projectId/git/revert', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) return c.json({ error: 'forbidden' }, 403);
  const projectId = c.req.param('projectId');
  const body = (await c.req.json().catch(() => null)) as { to?: unknown } | null;
  const to = typeof body?.to === 'string' ? body.to : '';
  if (!to || !isValidRev(to)) return c.json({ error: 'bad_request' }, 400);
  const handle = handleFor(projectId);
  if (!handle) return c.json({ error: 'no_active_session' }, 409);
  try {
    const result = await gitRevert(getSandbox(), handle, to);
    logger.info({ projectId, head: result.head }, 'git.reverted');
    return c.json({ ok: true, ...result });
  } catch (err) {
    return gitFailure(c, projectId, 'revert', err);
  }
});

function gitFailure(c: Context, projectId: string, op: string, err: unknown) {
  // A GitError is an expected command failure (e.g. unknown revision) → 422; any
  // other throw is unexpected (exec/transport) → 502.
  const message = err instanceof Error ? err.message : String(err);
  logger.warn({ projectId, op, err: message }, 'git.query_failed');
  if (err instanceof GitError) return c.json({ error: 'git_error', message }, 422);
  return c.json({ error: 'git_query_failed' }, 502);
}
