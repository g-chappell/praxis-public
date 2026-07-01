// GET/POST /api/admin/blocklist — manage the email/domain sign-in blocklist
// (STORY-46). Admin-only. POST adds an entry (audited); the sign-in gate
// (lib/blocklist.ts) enforces it.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { addBlocklistEntry, listBlocklist, normalizeBlocklistValue } from '@/lib/admin-blocklist';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ entries: await listBlocklist() });
}

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    value?: unknown;
    isDomain?: unknown;
    reason?: unknown;
  } | null;
  const value = typeof body?.value === 'string' ? normalizeBlocklistValue(body.value) : '';
  if (!value || value.length > 320) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }
  // Explicit isDomain wins; otherwise infer (no '@' → domain).
  const isDomain = typeof body?.isDomain === 'boolean' ? body.isDomain : !value.includes('@');
  // Shape sanity at the boundary: emails contain '@', domains contain a dot.
  if (isDomain ? !value.includes('.') : !value.includes('@')) {
    return NextResponse.json({ error: 'invalid_value' }, { status: 400 });
  }
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

  const entry = await addBlocklistEntry({ value, isDomain, reason, addedBy: session.user.id });
  if (!entry) return NextResponse.json({ error: 'already_blocked' }, { status: 409 });

  await recordAudit(session.user.id, 'blocklist.added', {
    targetType: 'email_blocklist',
    targetId: entry.id,
    metadata: { value, isDomain, reason },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ entry }, { status: 201 });
}
