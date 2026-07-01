// /api/projects — list (GET) and create (POST) the signed-in user's projects.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { projects } from '@praxis/db';
import { db } from '@praxis/db/client';

import { getAuth } from '@/lib/auth';
import {
  listUserProjects,
  parseProjectSort,
  parseProjectStatus,
  resolveCreateTeam,
} from '@/lib/projects';
import { DEFAULT_TEMPLATE_ID, isTemplateId } from '@/lib/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const status = parseProjectStatus(req.nextUrl.searchParams.get('status'));
  const sort = parseProjectSort(req.nextUrl.searchParams.get('sort'));
  return NextResponse.json({ projects: await listUserProjects(session.user.id, { status, sort }) });
}

export async function POST(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    templateId?: unknown;
    teamId?: unknown;
  } | null;
  const name =
    typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled project';
  const templateId = isTemplateId(body?.templateId) ? body.templateId : DEFAULT_TEMPLATE_ID;
  // Reject an explicit-but-unknown templateId rather than silently defaulting.
  if (body?.templateId !== undefined && !isTemplateId(body.templateId)) {
    return NextResponse.json({ error: 'unknown_template' }, { status: 400 });
  }

  // Pick the team the project belongs to (STORY-57): the requested team (must be
  // a member) or, when none is given, their most-recent team. A teamless user is
  // refused — teams are explicit (STORY-54), no auto-create.
  const teamId = typeof body?.teamId === 'string' ? body.teamId : undefined;
  const resolved = await resolveCreateTeam(session.user.id, teamId);
  if ('error' in resolved) {
    const status = resolved.error === 'needs_team' ? 409 : 403;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const [project] = await db
    .insert(projects)
    .values({ teamId: resolved.teamId, name, templateId, createdBy: session.user.id })
    .returning({ id: projects.id });

  return NextResponse.json({ id: project!.id });
}
