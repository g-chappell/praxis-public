// GET /admin/stats — internal-secret-gated platform health for the web admin
// overview (STORY-48): the count of running sandbox containers plus version /
// gitSha / uptime. Same internal-secret gate as POST /sessions. The web app
// tolerates this being unreachable and degrades the relevant tiles.

import { Hono } from 'hono';

import { getSandbox } from '../runtime';
import { GIT_SHA, VERSION } from '../version';

export const adminStatsRoute = new Hono();

adminStatsRoute.get('/stats', async (c) => {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!secret || c.req.header('x-internal-secret') !== secret) {
    return c.json({ error: 'forbidden' }, 403);
  }

  // Best-effort: a Docker hiccup shouldn't 500 the health probe — report null and
  // let the web tile show "unavailable".
  let runningSandboxes: number | null = null;
  try {
    runningSandboxes = await getSandbox().runningCount();
  } catch {
    runningSandboxes = null;
  }

  return c.json({
    runningSandboxes,
    version: VERSION,
    gitSha: GIT_SHA,
    uptimeSec: Math.round(process.uptime()),
  });
});
