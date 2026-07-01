// DELETE /api/projects/[id] — delete a project the signed-in user owns.
// Destroys the sandbox (container + volume + snapshot) via the orchestrator so
// no stale artifacts remain, then removes the DB rows, and logs the deletion
// for traceability. Ownership is enforced here; the orchestrator call is
// internal-secret-gated.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';
import {
  deleteProject,
  parseBudgetUsd,
  parseProjectPatch,
  setProjectArchived,
  setProjectBudget,
  updateProject,
  userOwnsProject,
} from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PATCH /api/projects/[id] — rename / re-describe (STORY-39) or archive/restore
// (STORY-40) a project the user owns. Validates at the boundary, persists, and
// logs the change for traceability.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const projectId = params.id;
  if (!(await userOwnsProject(session.user.id, projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    description?: unknown;
    archived?: unknown;
    budgetUsd?: unknown;
  } | null;

  // Budget change (STORY-23) — its own directive; owner-gated above.
  if (body?.budgetUsd !== undefined) {
    const budget = parseBudgetUsd(body.budgetUsd);
    if (budget === null) {
      return NextResponse.json({ error: 'invalid_budget' }, { status: 400 });
    }
    const ok = await setProjectBudget(session.user.id, projectId, budget);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await recordAudit(session.user.id, 'project.updated', {
      targetType: 'project',
      targetId: projectId,
      metadata: { budgetUsd: budget },
      ip: clientIp(hdrs),
    });
    return NextResponse.json({ id: projectId, budgetUsd: budget });
  }

  // Archive / restore is a distinct directive from rename — handle it first.
  if (typeof body?.archived === 'boolean') {
    const ok = await setProjectArchived(session.user.id, projectId, body.archived);
    if (!ok) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    // On archive, cold-store the sandbox immediately (STORY-52): snapshot + tear
    // the container down (keeping the volume). Best-effort — the read-only guard
    // already blocks interaction and the idle sweep is the backstop, so a failure
    // here doesn't fail the archive. Restore needs no call: reopening rebuilds.
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
        userId: session.user.id,
        at: new Date().toISOString(),
      }),
    );
    await recordAudit(session.user.id, body.archived ? 'project.archived' : 'project.restored', {
      targetType: 'project',
      targetId: projectId,
      ip: clientIp(hdrs),
    });
    return NextResponse.json({ id: projectId, archived: body.archived });
  }

  const parsed = parseProjectPatch(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const updated = await updateProject(session.user.id, projectId, parsed.fields);
  if (!updated) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  console.info(
    JSON.stringify({
      event: 'project.updated',
      projectId,
      userId: session.user.id,
      fields: Object.keys(parsed.fields),
      at: new Date().toISOString(),
    }),
  );
  await recordAudit(session.user.id, 'project.updated', {
    targetType: 'project',
    targetId: projectId,
    metadata: { fields: Object.keys(parsed.fields) },
    ip: clientIp(hdrs),
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const projectId = params.id;
  if (!(await userOwnsProject(session.user.id, projectId))) {
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

  await deleteProject(session.user.id, projectId);

  // Audit trail for the destructive action (who/what/when).
  console.info(
    JSON.stringify({
      event: 'project.deleted',
      projectId,
      userId: session.user.id,
      at: new Date().toISOString(),
    }),
  );
  await recordAudit(session.user.id, 'project.deleted', {
    targetType: 'project',
    targetId: projectId,
    ip: clientIp(hdrs),
  });

  return NextResponse.json({ ok: true });
}
