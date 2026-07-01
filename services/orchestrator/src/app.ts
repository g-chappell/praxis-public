// HTTP-only Hono app construction. Importing this module is safe under
// Node (Vitest CI) — no Bun globals are referenced. The Bun-specific
// WebSocket route is mounted in index.ts via `attachWebSocketRoute`,
// so it never enters the Node test path.

import { Hono } from 'hono';

import { httpLogger } from './logger';
import { proxyToSandbox, resolvePreviewTarget, slugForHost } from './preview';
import { gitRoute } from './routes/git';
import { healthRoute } from './routes/health';
import { mcpRoute } from './routes/mcp';
import { projectsRoute } from './routes/projects';
import { sessionsRoute } from './routes/sessions';
import { VERSION } from './version';

export const app = new Hono();

app.use('*', httpLogger);

// Preview routing: requests arrive on the orchestrator port with a
// `<slug>.preview.localhost` Host. When the Host is a preview host,
// reverse-proxy to the mapped sandbox (or 404 if the slug isn't live). All
// other Hosts (the API) fall through.
app.use('*', async (c, next) => {
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  const slug = slugForHost(host);
  if (slug === null) return next();
  // Re-resolve the bound container's live IP per request: a stale entry whose
  // container is gone (so its IP may now belong to another project) returns null
  // and is never served (STORY-51 cross-project isolation).
  const target = await resolvePreviewTarget(slug);
  if (!target) return c.text('no such preview', 404);
  return proxyToSandbox(c.req.raw, target);
});

app.get('/', (c) => c.text(`praxis-orchestrator ${VERSION}`));
app.route('/health', healthRoute);
app.route('/sessions', sessionsRoute);
app.route('/projects', projectsRoute);
app.route('/projects', gitRoute);
app.route('/internal/mcp', mcpRoute);
