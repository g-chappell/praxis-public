// DELETE /api/teams/[id]/members/[userId] — the team owner removes a member
// (STORY-56). Owner-gated in removeMember; the owner can't remove themselves.
// Deleting the membership revokes the target's access to the team's projects on
// their next request (userOwnsProject is membership-scoped).

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { removeMember } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; userId: string } },
) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await removeMember(session.user.id, params.id, params.userId);
  if ('error' in result) {
    const status = result.error === 'not_owner' ? 403 : result.error === 'not_found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
