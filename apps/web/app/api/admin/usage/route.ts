// GET /api/admin/usage — platform-wide usage + cost aggregation over a time
// window (STORY-49). Admin-only. ?from/?to are ISO timestamps; omit for all-time.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminUsageOverview } from '@/lib/admin-usage';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const overview = await adminUsageOverview({
    from: parseDate(searchParams.get('from')),
    to: parseDate(searchParams.get('to')),
  });
  return NextResponse.json(overview);
}
