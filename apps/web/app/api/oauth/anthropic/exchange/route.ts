// POST /api/oauth/anthropic/exchange
// Finishes the code-paste connect flow: the user authorized on Anthropic,
// copied the authorization code, and pasted it back. We verify the CSRF state,
// exchange the code using the PKCE verifier stored at authorize time, encrypt
// the tokens, and upsert the user's oauth_tokens row.

import { timingSafeEqual } from 'node:crypto';

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { encrypt } from '@praxis/crypto';
import { oauthTokens } from '@praxis/db';
import { db } from '@praxis/db/client';

import {
  PROVIDER,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  exchangeCode,
  parsePastedCode,
} from '@/lib/anthropic-oauth';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return fail(401, 'unauthorized');
  }

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const pasted = typeof body?.code === 'string' ? body.code : '';
  const verifier = req.cookies.get(VERIFIER_COOKIE)?.value;
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  if (!verifier || !cookieState) {
    return fail(400, 'connection_expired');
  }

  const { code, state: stateFromCode } = parsePastedCode(pasted);
  if (!code) {
    return fail(400, 'missing_code');
  }
  // If Anthropic appended the state to the code, it must match what we issued.
  if (stateFromCode && !safeEqual(stateFromCode, cookieState)) {
    return fail(400, 'state_mismatch');
  }

  let tokens;
  try {
    tokens = await exchangeCode({ code, verifier, state: stateFromCode ?? cookieState });
  } catch {
    return fail(502, 'exchange_failed');
  }

  const accessTokenEncrypted = await encrypt(tokens.accessToken);
  const refreshTokenEncrypted = tokens.refreshToken ? await encrypt(tokens.refreshToken) : null;

  await db
    .insert(oauthTokens)
    .values({
      userId: session.user.id,
      provider: PROVIDER,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      expiresAt: tokens.expiresAt,
    })
    .onConflictDoUpdate({
      target: [oauthTokens.userId, oauthTokens.provider],
      set: {
        accessTokenEncrypted,
        refreshTokenEncrypted,
        expiresAt: tokens.expiresAt,
        connectedAt: new Date(),
      },
    });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(STATE_COOKIE);
  res.cookies.delete(VERIFIER_COOKIE);
  return res;
}
