// GET/PATCH /api/admin/users/[id] (STORY-45/46). GET returns one user's detail.
// PATCH changes their role ({role}, STORY-45) OR ban status ({banned,reason},
// STORY-46), each with guards (no self-demote/ban, no removing the last admin)
// and an audit row. Banning also revokes the user's sessions. Admin-only.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import {
  adminGetUser,
  adminSetUserBanned,
  adminSetUserRole,
  countAdmins,
  getUserRole,
} from '@/lib/admin-users';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';
import { revokeUserSessions } from '@/lib/blocklist';

const REASON_MAX = 500;
function parseReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const reason = value.trim();
  if (!reason || reason.length > REASON_MAX) return null;
  return reason;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const user = await adminGetUser(params.id);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    role?: unknown;
    banned?: unknown;
    reason?: unknown;
  } | null;

  // Ban / unban branch (STORY-46).
  if (typeof body?.banned === 'boolean') {
    const banned = body.banned;
    const role = await getUserRole(params.id);
    if (!role) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (banned) {
      const reason = parseReason(body.reason);
      if (!reason) return NextResponse.json({ error: 'reason_required' }, { status: 400 });
      // Guards: an admin can't ban themselves or the last remaining admin.
      if (params.id === session.user.id) {
        return NextResponse.json({ error: 'self_ban' }, { status: 400 });
      }
      if (role === 'admin' && (await countAdmins()) <= 1) {
        return NextResponse.json({ error: 'last_admin' }, { status: 400 });
      }
      const ok = await adminSetUserBanned(params.id, true, reason);
      if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await revokeUserSessions(params.id); // sign them out everywhere
      await recordAudit(session.user.id, 'user.banned', {
        targetType: 'user',
        targetId: params.id,
        metadata: { reason },
        ip: clientIp(hdrs),
      });
      return NextResponse.json({ id: params.id, banned: true });
    }

    const ok = await adminSetUserBanned(params.id, false, null);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await recordAudit(session.user.id, 'user.unbanned', {
      targetType: 'user',
      targetId: params.id,
      ip: clientIp(hdrs),
    });
    return NextResponse.json({ id: params.id, banned: false });
  }

  const role = body?.role;
  if (role !== 'user' && role !== 'admin') {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }

  const current = await getUserRole(params.id);
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (current === role) return NextResponse.json({ id: params.id, role }); // no-op

  // Guard 1: an admin can't strip their own admin role (locking themselves out).
  if (params.id === session.user.id && current === 'admin' && role === 'user') {
    return NextResponse.json({ error: 'self_demote' }, { status: 400 });
  }
  // Guard 2: never demote the last remaining admin.
  if (current === 'admin' && role === 'user' && (await countAdmins()) <= 1) {
    return NextResponse.json({ error: 'last_admin' }, { status: 400 });
  }

  const ok = await adminSetUserRole(params.id, role);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(session.user.id, 'user.role_changed', {
    targetType: 'user',
    targetId: params.id,
    metadata: { from: current, to: role },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ id: params.id, role });
}
