// POST /sessions — start an agent session for a project.
//
// Server-to-server only: the web app (which has already verified project
// ownership) calls this with the shared internal secret. We create the session
// row, start the sandbox (restoring its snapshot if the volume is empty), open a
// room, and mint a one-time WS ticket the browser uses to connect. The browser
// never reaches this endpoint directly.

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { projects, sessions } from '@praxis/db';
import { db } from '@praxis/db/client';

import { logger } from '../logger';
import { seedImageGenMcp } from '../mcp-seed';
import { previewUrlFor, registerPreview } from '../preview';
import { startReadinessProbe } from '../readiness';
import { createRoom, getRoomByProject, getSandbox, mintTicket, type SessionRoom } from '../runtime';
import { readTemplateConfig } from '../templates';

export const sessionsRoute = new Hono();

// Per-project create-lock: overlapping opens (e.g. two tabs) must not each boot a
// sandbox / insert a session row. The first caller's create promise is parked
// here; concurrent callers await it and attach to the room it produced.
const creating = new Map<string, Promise<SessionRoom>>();

/** The live room for a project, creating it once if absent. Concurrent first
 *  joiners share a single create; everyone after attaches to the existing room. */
async function ensureRoom(
  projectId: string,
  templateId: string,
  apiKey: string,
  openaiKey: string | undefined,
  seed: RoomSeed,
): Promise<SessionRoom> {
  const live = getRoomByProject(projectId);
  if (live) return live;
  const inflight = creating.get(projectId);
  if (inflight) return inflight;
  const create = createProjectRoom(projectId, templateId, apiKey, openaiKey, seed).finally(() =>
    creating.delete(projectId),
  );
  creating.set(projectId, create);
  return create;
}

/** Per-project state seeded onto a new room from the DB (STORY-36). */
interface RoomSeed {
  agentSessionId: string | null;
}

/** Boot the sandbox, register the preview, start the dev server, insert the
 *  session row, and open the room — the one-time setup for a project's session. */
async function createProjectRoom(
  projectId: string,
  templateId: string,
  apiKey: string,
  openaiKey: string | undefined,
  seed: RoomSeed,
): Promise<SessionRoom> {
  // start() restores from the object store if configured and the volume is empty.
  const handle = await getSandbox().start(projectId, templateId);

  // Register the preview: map the project's slug → the sandbox's dev-server port
  // so <projectId>.preview.localhost is proxied to it (see preview.ts).
  const { previewPort, setup, dev, mcpServers } = readTemplateConfig(templateId);
  let previewUrl: string | null = null;
  try {
    const addr = await getSandbox().exposePort(handle, previewPort); // http://<ip>:<port>
    registerPreview(projectId, {
      ip: new URL(addr).hostname,
      port: previewPort,
      containerId: handle.containerId,
    });
    previewUrl = previewUrlFor(projectId);
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'preview.register_failed',
    );
  }

  // Auto-start the template's dev server so the preview actually serves the app.
  // Fire-and-forget: npm install can take a minute, during which the preview 502s
  // ("starting…"). node_modules persists on the volume, so resumes are fast.
  // Templates with no dev command (e.g. blank) skip this.
  if (dev) {
    const cmd = setup ? `${setup} && ${dev}` : dev;
    getSandbox()
      .spawn(handle, cmd)
      .then((p) => logger.info({ projectId, pid: p.pid }, 'preview.dev_server_started'))
      .catch((err) =>
        logger.warn(
          { projectId, err: err instanceof Error ? err.message : String(err) },
          'preview.dev_server_failed',
        ),
      );
  }

  const [session] = await db
    .insert(sessions)
    .values({ projectId, containerId: handle.containerId, previewUrl })
    .returning({ id: sessions.id });
  const sessionId = session!.id;

  const room = createRoom(sessionId, projectId, handle, apiKey, previewUrl, openaiKey);
  // Wire the image-gen MCP server (STORY-15) when the template opts in and an
  // OpenAI key is available. Best-effort: a seed failure must never block session
  // creation (image generation is simply unavailable).
  if (mcpServers.includes('image-gen')) {
    try {
      await seedImageGenMcp(getSandbox(), handle, {
        openaiKey,
        usageToken: room.mcpToken,
        usageUrl: process.env.PRAXIS_MCP_USAGE_URL ?? 'http://orchestrator:4001/internal/mcp/usage',
      });
    } catch (err) {
      logger.warn(
        { projectId, err: err instanceof Error ? err.message : String(err) },
        'mcp.seed_failed',
      );
    }
  }
  // Seed the resume id so the first prompt's openAgent loads the prior
  // conversation via session/load (ADR-0017/STORY-36). Null on a project's first
  // ever session.
  room.agentSessionId = seed.agentSessionId ?? undefined;
  // Probe the dev server and broadcast `workspace_ready` once it answers so the
  // client's loading screen only clears when the preview is actually serveable
  // (STORY-51). No dev server → ready immediately.
  startReadinessProbe(room, Boolean(dev));
  logger.info({ sessionId, projectId }, 'session.created');
  return room;
}

sessionsRoute.post('/', async (c) => {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!secret || c.req.header('x-internal-secret') !== secret) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    projectId?: unknown;
    userId?: unknown;
    userName?: unknown;
    userImage?: unknown;
    apiKey?: unknown;
    openaiKey?: unknown;
  } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const userName = typeof body?.userName === 'string' ? body.userName : '';
  const userImage = typeof body?.userImage === 'string' ? body.userImage : null;
  // The operator's ANTHROPIC_API_KEY, read from env by the web app and passed here.
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  // Optional OpenAI key for the image-gen MCP server.
  const openaiKey = typeof body?.openaiKey === 'string' ? body.openaiKey : undefined;
  if (!projectId || !userId || !apiKey) {
    return c.json({ error: 'bad_request' }, 400);
  }

  const [project] = await db
    .select({
      templateId: projects.templateId,
      agentSessionId: projects.agentSessionId,
      archivedAt: projects.archivedAt,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return c.json({ error: 'project_not_found' }, 404);
  }
  // Archived projects are read-only cold storage (STORY-52). The web app gates
  // this too; refuse here as the security boundary so no session/sandbox spins up.
  if (project.archivedAt) {
    return c.json({ error: 'archived' }, 409);
  }

  // Attach to the project's live room, or create it once. The seed carries
  // cross-session resume (STORY-36).
  const room = await ensureRoom(projectId, project.templateId, apiKey, openaiKey, {
    agentSessionId: project.agentSessionId,
  });
  const ticket = mintTicket({ sessionId: room.sessionId, userId, userName, userImage });
  logger.info({ sessionId: room.sessionId, projectId, userId }, 'session.joined');

  return c.json({ sessionId: room.sessionId, ticket, previewUrl: room.previewUrl });
});
