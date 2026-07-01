// DELETE /api/admin/blocklist/[id] — remove a blocklist entry (STORY-46).
// Admin-only, audited.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { removeBlocklistEntry } from '@/lib/admin-blocklist';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const removed = await removeBlocklistEntry(params.id);
  if (!removed) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(session.user.id, 'blocklist.removed', {
    targetType: 'email_blocklist',
    targetId: params.id,
    metadata: { value: removed.value },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ ok: true });
}
