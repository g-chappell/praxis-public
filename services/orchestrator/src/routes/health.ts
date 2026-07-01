// GET /health — the canonical "are you alive" endpoint.
// Consumed by Caddy's `health_uri`, the deploy workflow's smoke test,
// and any external uptime monitor we wire later.
//
// Shape is locked (see services/orchestrator/AGENTS.md). Adding fields
// is fine; removing/renaming requires an ADR.

import { Hono } from 'hono';

import { GIT_SHA, VERSION } from '../version';

export const healthRoute = new Hono();

healthRoute.get('/', (c) =>
  c.json({
    ok: true,
    version: VERSION,
    gitSha: GIT_SHA,
    uptimeSec: Math.round(process.uptime()),
  }),
);
