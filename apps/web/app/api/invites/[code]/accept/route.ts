// POST /api/invites/[code]/accept — redeem an invite for the signed-in user
// (STORY-31). Returns the discriminated AcceptResult; the /invite/[code] page
// uses the same acceptInvite() server-side, this route covers programmatic use.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { acceptInvite } from '@/lib/invites';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { code: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await acceptInvite(session.user.id, params.code);
  return NextResponse.json(result);
}
