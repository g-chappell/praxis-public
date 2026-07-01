// Internal endpoint the in-sandbox MCP server calls to cap usage (STORY-15). Auth
// is the per-room capability token (no global secret in the sandbox); it resolves
// to exactly one project, so a sandbox can only spend its own quota.

import { Hono } from 'hono';

import { logger } from '../logger';
import { MCP_IMAGE_CAP, checkAndIncrement } from '../mcp-usage';
import { getRoomByMcpToken } from '../runtime';

export const mcpRoute = new Hono();

mcpRoute.post('/usage', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    token?: unknown;
    tool?: unknown;
  } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const tool = typeof body?.tool === 'string' ? body.tool : '';
  const room = token ? getRoomByMcpToken(token) : undefined;
  if (!room || !tool) return c.json({ error: 'invalid_token' }, 403);

  try {
    return c.json(await checkAndIncrement(room.projectId, tool, MCP_IMAGE_CAP));
  } catch (err) {
    // Fail CLOSED: this caps a paid external API, so a transient DB error denies
    // rather than letting unbounded spend through.
    logger.error(
      { projectId: room.projectId, err: err instanceof Error ? err.message : String(err) },
      'mcp_usage.check_failed',
    );
    return c.json({ allowed: false, count: 0, cap: MCP_IMAGE_CAP, error: 'usage_check_failed' });
  }
});
