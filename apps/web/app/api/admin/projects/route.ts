// GET /api/admin/projects — every project (any owner) with owner, member count,
// status, and last activity (STORY-44). Admin-only: 401 unauthenticated, 403 for
// non-admins. Supports ?q (name/owner search), ?sort, and ?status.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminListProjects, parseAdminProjectSort } from '@/lib/admin-projects';
import { getAuth } from '@/lib/auth';
import { parseProjectStatus } from '@/lib/projects';

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
  const projects = await adminListProjects({
    q: searchParams.get('q') ?? undefined,
    sort: parseAdminProjectSort(searchParams.get('sort')),
    status: parseProjectStatus(searchParams.get('status')),
  });
  return NextResponse.json({ projects });
}
