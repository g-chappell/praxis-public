// GET /api/admin/users — every user with role, banned status, created date, and
// project count (STORY-45). Admin-only: 401 unauthenticated, 403 non-admin.
// Supports ?q (email/name search) and ?sort.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminListUsers, parseAdminUserSort } from '@/lib/admin-users';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const users = await adminListUsers({
    q: searchParams.get('q') ?? undefined,
    sort: parseAdminUserSort(searchParams.get('sort')),
  });
  return NextResponse.json({ users });
}
