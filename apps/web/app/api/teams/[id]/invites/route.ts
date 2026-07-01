// POST /api/teams/[id]/invites — the team owner mints a single-use invite link
// for that team (STORY-56). Owner-gated + cap-aware in createTeamInvite; returns
// { code, url, expiresAt } and the browser shares the url out-of-band.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { createTeamInvite } from '@/lib/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: h });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await createTeamInvite(session.user.id, params.id);
  if ('error' in result) {
    const status = result.error === 'not_owner' ? 403 : result.error === 'team_full' ? 409 : 404;
    return NextResponse.json({ error: result.error }, { status });
  }

  // Build the public link from the forwarded host (behind Caddy) so the code
  // resolves the same way the user reached the app.
  const { code, expiresAt } = result.invite;
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const origin = host ? `${proto}://${host}` : new URL(req.url).origin;
  return NextResponse.json({ code, url: `${origin}/invite/${code}`, expiresAt });
}
