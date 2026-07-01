// POST /api/sessions — start an agent session for a project (STORY-09).
// Authenticated + ownership-checked, then calls the orchestrator server-to-server
// (shared internal secret) to create the session + mint a one-time WS ticket.
// Returns { sessionId, ticket, wsUrl }; the browser opens the WS itself using
// the runtime-configured wsUrl + the ticket.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { NoPlatformKeyError, getActivePlatformKey, tryGetActivePlatformKey } from '@praxis/keys';

import { getAuth } from '@/lib/auth';
import { connectorCredsForProject } from '@/lib/connector-creds';
import { isProjectArchived, userOwnsProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  if (!projectId) {
    return NextResponse.json({ error: 'missing_project' }, { status: 400 });
  }
  if (!(await userOwnsProject(session.user.id, projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Archived projects are read-only cold storage (STORY-52): refuse to start a
  // session so the agent can't be prompted and files can't be edited. Restore
  // (PATCH {archived:false}) brings it back.
  if (await isProjectArchived(projectId)) {
    return NextResponse.json({ error: 'archived' }, { status: 409 });
  }

  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  // Returned to the browser so it can open the WS. Read at runtime (server-side)
  // — NOT a NEXT_PUBLIC_* build-time inline — so it's configurable via the env
  // file without rebuilding the web image.
  const wsUrl = process.env.ORCHESTRATOR_WS_URL;
  if (!orchestratorUrl || !internalSecret || !wsUrl) {
    return NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 });
  }

  // Decrypt the platform key here (Node/libsodium) and hand it to the
  // orchestrator over the internal channel — the Bun orchestrator can't load
  // libsodium (ADR-0009 / STORY-09 fix). Server-to-server only; never logged.
  let apiKey: string;
  try {
    apiKey = await getActivePlatformKey();
  } catch (err) {
    if (err instanceof NoPlatformKeyError) {
      return NextResponse.json({ error: 'no_platform_key' }, { status: 503 });
    }
    throw err;
  }

  // The OpenAI platform key is optional (STORY-38): when set, decrypt it (same
  // Node/libsodium path) and pass it alongside the Anthropic key for the image-gen
  // MCP server. Absent → omit; the session still runs (image-gen unavailable).
  const openaiKey = await tryGetActivePlatformKey('openai');

  // Decrypt the MCP connector credentials enabled for this project's template
  // (STORY-50, ADR-0020) and pass them alongside the platform keys — same posture
  // (the orchestrator never holds the master key). Empty when none are enabled.
  const connectorCreds = await connectorCredsForProject(projectId);

  const res = await fetch(`${orchestratorUrl}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
    body: JSON.stringify({
      projectId,
      userId: session.user.id,
      userName: session.user.name || session.user.email,
      userImage: session.user.image ?? null,
      apiKey,
      ...(openaiKey ? { openaiKey } : {}),
      ...(Object.keys(connectorCreds).length ? { connectorCreds } : {}),
    }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json({ error: 'session_start_failed' }, { status: 502 });
  }
  const { sessionId, ticket, previewUrl } = (await res.json()) as {
    sessionId: string;
    ticket: string;
    previewUrl?: string | null;
  };
  return NextResponse.json({ sessionId, ticket, wsUrl, previewUrl: previewUrl ?? null });
}
