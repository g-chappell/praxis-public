// POST /api/sessions — start an agent session for a project.
// Ownership-checked, then calls the orchestrator server-to-server (shared
// internal secret) to create the session + mint a one-time WS ticket. Returns
// { sessionId, ticket, wsUrl }; the browser opens the WS itself using the
// runtime-configured wsUrl + the ticket.
//
// The agent runs on the operator's own ANTHROPIC_API_KEY (and optional
// OPENAI_API_KEY for image generation) read from the environment — there is no
// platform key store or encryption in the local single-user build.

import { type NextRequest, NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/current-user';
import { isProjectArchived, userOwnsProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  if (!projectId) {
    return NextResponse.json({ error: 'missing_project' }, { status: 400 });
  }
  if (!(await userOwnsProject(user.id, projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Archived projects are read-only cold storage: refuse to start a session so
  // the agent can't be prompted and files can't be edited. Restore
  // (PATCH {archived:false}) brings it back.
  if (await isProjectArchived(projectId)) {
    return NextResponse.json({ error: 'archived' }, { status: 409 });
  }

  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  // Returned to the browser so it can open the WS. Read at runtime (server-side)
  // so it's configurable via the env file without rebuilding the web image.
  const wsUrl = process.env.ORCHESTRATOR_WS_URL;
  if (!orchestratorUrl || !internalSecret || !wsUrl) {
    return NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'no_api_key' }, { status: 503 });
  }
  // Optional: enables the image-gen MCP tool inside the sandbox.
  const openaiKey = process.env.OPENAI_API_KEY || undefined;

  const res = await fetch(`${orchestratorUrl}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
    body: JSON.stringify({
      projectId,
      userId: user.id,
      userName: user.name || user.email,
      userImage: user.image ?? null,
      apiKey,
      ...(openaiKey ? { openaiKey } : {}),
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
