// POST /api/oauth/anthropic/disconnect
// Removes the signed-in user's Anthropic connection by deleting their
// oauth_tokens row. Idempotent — deleting a non-existent row is a no-op.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { oauthTokens } from '@praxis/db';
import { db } from '@praxis/db/client';

import { PROVIDER } from '@/lib/anthropic-oauth';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await db
    .delete(oauthTokens)
    .where(and(eq(oauthTokens.userId, session.user.id), eq(oauthTokens.provider, PROVIDER)));

  return new NextResponse(null, { status: 204 });
}
