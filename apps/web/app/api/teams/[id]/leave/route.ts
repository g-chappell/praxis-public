// POST /api/teams/[id]/leave — a non-owner member leaves the team (STORY-56).
// The owner can't leave their own team (409). Deleting the membership revokes
// access to the team's projects on the next request.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { leaveTeam } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await leaveTeam(session.user.id, params.id);
  if ('error' in result) {
    const status = result.error === 'owner_cannot_leave' ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
