// POST /api/projects/[id]/duplicate — duplicate a project the local user owns.
// Creates a new "Copy of <name>" row, then asks the orchestrator to clone the
// source sandbox volume into it. If the clone fails the new row is rolled back so
// no empty/broken project is left. Ownership is enforced here; the orchestrator
// call is internal-secret-gated.

import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/current-user';
import { deleteProject, duplicateProjectRow, userOwnsProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const sourceProjectId = params.id;
  if (!(await userOwnsProject(user.id, sourceProjectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!orchestratorUrl || !internalSecret) {
    return NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 });
  }

  const copy = await duplicateProjectRow(user.id, sourceProjectId);
  if (!copy) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Clone the sandbox volume into the new project. Roll the row back on failure
  // so we never leave an empty duplicate.
  const res = await fetch(
    `${orchestratorUrl}/projects/${encodeURIComponent(sourceProjectId)}/duplicate`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({ newProjectId: copy.id, templateId: copy.templateId }),
    },
  ).catch(() => null);
  if (!res || !res.ok) {
    await deleteProject(user.id, copy.id);
    return NextResponse.json({ error: 'duplicate_failed' }, { status: 502 });
  }

  console.info(
    JSON.stringify({
      event: 'project.duplicated',
      sourceProjectId,
      newProjectId: copy.id,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ id: copy.id });
}
