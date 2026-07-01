// Mounts Better Auth's HTTP routes at /api/auth/*.
// All BA-authored endpoints (sign-in/magic-link, sign-out, get-session,
// magic-link/verify) flow through this catch-all handler.
//
// Wraps the BA handlers in thunks so module-import time (during
// Next.js page-data collection) doesn't trigger the env check inside
// `getAuth()`. The check fires on the first real request.

import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { GET: handler } = toNextJsHandler(getAuth());
  return handler(request);
}

export async function POST(request: Request) {
  const { POST: handler } = toNextJsHandler(getAuth());
  return handler(request);
}
