// GET /api/admin/audit — query the audit log with composable filters (actor,
// target type/id, action, time range) + pagination (STORY-47). Admin-only.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminQueryAudit, parseAuditAction, parseAuditLimit } from '@/lib/admin-audit';
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
  const limit = parseAuditLimit(searchParams.get('limit'));
  const offsetRaw = Number.parseInt(searchParams.get('offset') ?? '', 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const { entries, total } = await adminQueryAudit({
    actorUserId: searchParams.get('actor') ?? undefined,
    targetType: searchParams.get('targetType') ?? undefined,
    targetId: searchParams.get('targetId') ?? undefined,
    action: parseAuditAction(searchParams.get('action')),
    from: parseDate(searchParams.get('from')),
    to: parseDate(searchParams.get('to')),
    limit,
    offset,
  });
  return NextResponse.json({ entries, total, limit, offset });
}
