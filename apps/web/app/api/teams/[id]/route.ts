// PATCH /api/teams/[id] — rename a team the signed-in user owns (STORY-54).
// Owner-gated: 403 for a non-owner, 404 for an unknown team, 400 for an
// empty/too-long name. Writes a team.renamed audit row on success.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { renameTeam } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const result = await renameTeam(session.user.id, params.id, body?.name);
  if ('error' in result) {
    const status = result.error === 'not_owner' ? 403 : result.error === 'not_found' ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ team: result.team });
}
