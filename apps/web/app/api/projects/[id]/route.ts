// PATCH/DELETE /api/projects/[id] — rename / re-describe / archive-restore /
// delete a project the local user owns. Ownership is enforced here; the
// orchestrator calls are internal-secret-gated.

import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/current-user';
import {
  deleteProject,
  parseProjectPatch,
  setProjectArchived,
  updateProject,
  userOwnsProject,
} from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const projectId = params.id;
  if (!(await userOwnsProject(user.id, projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    archived?: unknown;
  } | null;

  // Archive / restore is a distinct directive from rename — handle it first.
  if (typeof body?.archived === 'boolean') {
    const ok = await setProjectArchived(user.id, projectId, body.archived);
    if (!ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // On archive, tear the sandbox container down immediately (keeping the
    // volume). Best-effort — the read-only guard blocks interaction and the idle
    // sweep is the backstop, so a failure here doesn't fail the archive. Restore
    // needs no call: reopening rebuilds.
    if (body.archived) {
      const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
      const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
      if (orchestratorUrl && internalSecret) {
        await fetch(`${orchestratorUrl}/projects/${encodeURIComponent(projectId)}/archive`, {
          method: 'POST',
          headers: { 'x-internal-secret': internalSecret },
        }).catch(() => null);
      }
    }
    console.info(
      JSON.stringify({
        event: body.archived ? 'project.archived' : 'project.restored',
        projectId,
        at: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ id: projectId, archived: body.archived });
  }

  const parsed = parseProjectPatch(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const updated = await updateProject(user.id, projectId, parsed.fields);
  if (!updated) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  console.info(
    JSON.stringify({
      event: 'project.updated',
      projectId,
      fields: Object.keys(parsed.fields),
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const projectId = params.id;
  if (!(await userOwnsProject(user.id, projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!orchestratorUrl || !internalSecret) {
    return NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 });
  }

  // Destroy the sandbox first — if it fails we keep the DB row so the user can
  // retry rather than orphan a container/volume.
  const res = await fetch(`${orchestratorUrl}/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
    headers: { 'x-internal-secret': internalSecret },
  }).catch(() => null);
  if (!res || !res.ok) {
    return NextResponse.json({ error: 'sandbox_destroy_failed' }, { status: 502 });
  }

  await deleteProject(user.id, projectId);

  console.info(
    JSON.stringify({ event: 'project.deleted', projectId, at: new Date().toISOString() }),
  );

  return NextResponse.json({ ok: true });
}
