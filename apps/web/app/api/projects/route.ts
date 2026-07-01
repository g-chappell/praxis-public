// /api/projects — list (GET) and create (POST) the local user's projects.

import { type NextRequest, NextResponse } from 'next/server';

import { projects } from '@praxis/db';
import { db } from '@praxis/db/client';

import { getCurrentUser } from '@/lib/current-user';
import { listUserProjects, parseProjectSort, parseProjectStatus } from '@/lib/projects';
import { DEFAULT_TEMPLATE_ID, isTemplateId } from '@/lib/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const status = parseProjectStatus(req.nextUrl.searchParams.get('status'));
  const sort = parseProjectSort(req.nextUrl.searchParams.get('sort'));
  return NextResponse.json({ projects: await listUserProjects(user.id, { status, sort }) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    templateId?: unknown;
  } | null;
  const name =
    typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled project';
  const templateId = isTemplateId(body?.templateId) ? body.templateId : DEFAULT_TEMPLATE_ID;
  // Reject an explicit-but-unknown templateId rather than silently defaulting.
  if (body?.templateId !== undefined && !isTemplateId(body.templateId)) {
    return NextResponse.json({ error: 'unknown_template' }, { status: 400 });
  }

  const [project] = await db
    .insert(projects)
    .values({ name, templateId, createdBy: user.id })
    .returning({ id: projects.id });

  return NextResponse.json({ id: project!.id });
}
