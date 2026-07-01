// GET /api/oauth/anthropic/authorize
// Starts the Claude subscription OAuth flow: mints a CSRF `state` and a
// PKCE verifier/challenge, stashes both in short-lived httpOnly cookies,
// and redirects the user to Anthropic's consent screen. After consent the
// user copies the shown code back into /settings, which POSTs it to
// /api/oauth/anthropic/exchange (the cookies carry the verifier + state).

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  buildAuthorizeUrl,
  createPkce,
  createState,
} from '@/lib/anthropic-oauth';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.redirect(new URL('/signin', getRedirectBase()));
  }

  const state = createState();
  const { verifier, challenge } = createPkce();

  const res = NextResponse.redirect(buildAuthorizeUrl({ state, challenge }));
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 900, // 15 min — the manual copy/paste step takes longer than a redirect
  };
  res.cookies.set(STATE_COOKIE, state, cookieOptions);
  res.cookies.set(VERIFIER_COOKIE, verifier, cookieOptions);
  return res;
}

function getRedirectBase(): string {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.NODE_ENV === 'production'
      ? 'https://praxis.blacksail.dev'
      : 'http://localhost:3000')
  );
}
