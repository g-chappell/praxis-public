// GET /api/projects/[id]/usage — cumulative token usage + estimated cost for a
// project the signed-in user is a member of (STORY-22). 403 for non-members.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { projectUsage } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const usage = await projectUsage(session.user.id, params.id);
  if (!usage) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(usage);
}
