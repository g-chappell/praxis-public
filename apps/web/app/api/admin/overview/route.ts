// GET /api/admin/overview — platform counts, per-provider key status, recent
// admin actions, and live orchestrator health for the admin landing (STORY-48).
// Admin-only. The orchestrator health degrades to null rather than 500ing.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminOverview } from '@/lib/admin-overview';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json(await adminOverview());
}
