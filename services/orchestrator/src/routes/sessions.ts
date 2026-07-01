// POST /sessions — start an agent session for a project (STORY-09).
//
// Server-to-server only: the web app (which has already authenticated the user
// and verified project ownership) calls this with the shared internal secret.
// We create the session row, start the sandbox (restoring its snapshot if the
// volume is empty), open a room, and mint a one-time WS ticket the browser uses
// to connect. The browser never reaches this endpoint directly.

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { projects, sessions } from '@praxis/db';
import { db } from '@praxis/db/client';

import { logger } from '../logger';
import { enabledConnectorsForTemplate } from '../mcp-registry';
import { seedImageGenMcp, seedRegistryConnectors } from '../mcp-seed';
import { previewUrlFor, registerPreview } from '../preview';
import { startReadinessProbe } from '../readiness';
import { createRoom, getRoomByProject, getSandbox, mintTicket, type SessionRoom } from '../runtime';
import { readTemplateConfig } from '../templates';

export const sessionsRoute = new Hono();

// Per-project create-lock (STORY-32): two users opening the same project at once
// must not each boot a sandbox / insert a session row. The first caller's create
// promise is parked here; concurrent callers await it and then attach to the room
// it produced. Cleared when the create settles.
const creating = new Map<string, Promise<SessionRoom>>();

/** The live room for a project, creating it once if absent. Concurrent first
 *  joiners share a single create; everyone after attaches to the existing room. */
async function ensureRoom(
  projectId: string,
  templateId: string,
  apiKey: string,
  openaiKey: string | undefined,
  connectorCreds: Record<string, string>,
  seed: RoomSeed,
): Promise<SessionRoom> {
  const live = getRoomByProject(projectId);
  // Room reuse: a second joiner attaches to the live room and its keys — the
  // first creator's openaiKey (like apiKey) is the one held for the session's
  // lifetime. A later joiner's key does not replace it.
  if (live) return live;
  const inflight = creating.get(projectId);
  if (inflight) return inflight;
  const create = createProjectRoom(
    projectId,
    templateId,
    apiKey,
    openaiKey,
    connectorCreds,
    seed,
  ).finally(() => creating.delete(projectId));
  creating.set(projectId, create);
  return create;
}

/** Per-project state seeded onto a new room from the DB (STORY-36/STORY-34). */
interface RoomSeed {
  agentSessionId: string | null;
  controlMode: string;
  ownerUserId: string | null;
}

/** Boot the sandbox, register the preview, start the dev server, insert the
 *  session row, and open the room — the one-time setup for a project's session. */
async function createProjectRoom(
  projectId: string,
  templateId: string,
  apiKey: string,
  openaiKey: string | undefined,
  connectorCreds: Record<string, string>,
  seed: RoomSeed,
): Promise<SessionRoom> {
  // start() restores from MinIO if the volume is empty (ADR-0008).
  const handle = await getSandbox().start(projectId, templateId);

  // Register the preview: map the project's slug → the sandbox's dev-server port
  // so Caddy's wildcard proxies <projectId>.preview.<domain> here (STORY-13).
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

  // Auto-start the template's dev server so the preview actually serves the app
  // (TASK-041). Fire-and-forget: npm install can take a minute, during which the
  // preview 502s ("starting…"). node_modules persists on the volume, so resumes
  // are fast. Templates with no dev command (e.g. blank) skip this.
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
  // Wire the image-gen MCP server (STORY-15) when the template opts in. Runs once
  // per room lifetime (rejoin reuses the live room), so the cred file's usage
  // token always matches this room; a later room re-seeds with its fresh token.
  // Best-effort: a seed failure must never block session creation.
  if (mcpServers.includes('image-gen')) {
    try {
      await seedImageGenMcp(getSandbox(), handle, {
        openaiKey,
        usageToken: room.mcpToken,
        usageUrl:
          process.env.PRAXIS_MCP_USAGE_URL ?? 'http://praxis-orchestrator:4001/internal/mcp/usage',
      });
    } catch (err) {
      logger.warn(
        { projectId, err: err instanceof Error ? err.message : String(err) },
        'mcp.seed_failed',
      );
    }
  }
  // Wire the enabled registry connectors for this template (STORY-50/TASK-148,
  // ADR-0020). Non-secret config from the DB; credentials were decrypted web-side
  // and passed in. Best-effort — read-merges with the image-gen config above.
  try {
    const connectors = await enabledConnectorsForTemplate(templateId);
    if (connectors.length > 0) {
      await seedRegistryConnectors(getSandbox(), handle, connectors, connectorCreds, {
        usageToken: room.mcpToken,
        usageUrl:
          process.env.PRAXIS_MCP_USAGE_URL ?? 'http://praxis-orchestrator:4001/internal/mcp/usage',
      });
    }
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'mcp.registry_seed_failed',
    );
  }
  // Seed the resume id so the first prompt's openAgent loads the prior
  // conversation via session/load (ADR-0017/STORY-36). Null on a project's first
  // ever session.
  room.agentSessionId = seed.agentSessionId ?? undefined;
  // Seed the prompt-control mode + owner (STORY-34); turn_based starts with the
  // owner holding control.
  room.mode = seed.controlMode === 'turn_based' ? 'turn_based' : 'serialised';
  room.ownerUserId = seed.ownerUserId;
  if (room.mode === 'turn_based') room.controlHolder = seed.ownerUserId ?? undefined;
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
    connectorCreds?: unknown;
  } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  const userName = typeof body?.userName === 'string' ? body.userName : '';
  const userImage = typeof body?.userImage === 'string' ? body.userImage : null;
  // The web app decrypts the platform key (Node/libsodium) and passes it here —
  // the Bun orchestrator never loads libsodium. See runtime.ts SessionRoom.
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  // Optional OpenAI platform key for the image-gen MCP server (STORY-38). Absent
  // when no OpenAI key is configured — sessions still run normally.
  const openaiKey = typeof body?.openaiKey === 'string' ? body.openaiKey : undefined;
  // Decrypted MCP connector credentials for this project's template (STORY-50,
  // ADR-0020). The web decrypts them (the orchestrator never holds the master
  // key) and passes {connectorName: plaintext}; the orchestrator writes them to
  // the ephemeral cred file. Absent → no registry connectors / no creds.
  const connectorCreds: Record<string, string> =
    body?.connectorCreds && typeof body.connectorCreds === 'object'
      ? Object.fromEntries(
          Object.entries(body.connectorCreds as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === 'string',
          ),
        )
      : {};
  if (!projectId || !userId || !apiKey) {
    return c.json({ error: 'bad_request' }, 400);
  }

  const [project] = await db
    .select({
      templateId: projects.templateId,
      agentSessionId: projects.agentSessionId,
      controlMode: projects.controlMode,
      ownerUserId: projects.createdBy,
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

  // Attach to the project's live room, or create it once (STORY-32). A second
  // user joining an active project reuses the same session/sandbox/preview — only
  // their WS ticket is per-user, stamped with their identity for presence + chat.
  // The seed carries cross-session resume (STORY-36) + control mode/owner (STORY-34).
  const room = await ensureRoom(projectId, project.templateId, apiKey, openaiKey, connectorCreds, {
    agentSessionId: project.agentSessionId,
    controlMode: project.controlMode,
    ownerUserId: project.ownerUserId,
  });
  const ticket = mintTicket({ sessionId: room.sessionId, userId, userName, userImage });
  logger.info({ sessionId: room.sessionId, projectId, userId }, 'session.joined');

  return c.json({ sessionId: room.sessionId, ticket, previewUrl: room.previewUrl });
});
