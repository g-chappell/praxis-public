// GET/PATCH/DELETE /api/admin/connectors/[id] (STORY-50, ADR-0020). Admin-only.
// GET returns the connector detail (+ per-template enablement, no plaintext
// credential). PATCH updates args/cap/credential. DELETE removes it.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { deleteConnector, getConnectorDetail, updateConnector } from '@/lib/admin-connectors';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(
  hdrs: Headers,
): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user)
    return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  if (!(await isUserAdmin(session.user.id))) {
    return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(await headers());
  if ('response' in auth) return auth.response;
  const connector = await getConnectorDetail(params.id);
  if (!connector) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ connector });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const auth = await requireAdmin(hdrs);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    args?: unknown;
    usageCap?: unknown;
    credential?: unknown;
  } | null;

  const patch: { args?: unknown; usageCap?: number | null; credential?: string | null } = {};
  if (body?.args !== undefined) patch.args = body.args;
  if (body?.usageCap !== undefined) {
    patch.usageCap =
      typeof body.usageCap === 'number' && body.usageCap >= 0 ? Math.floor(body.usageCap) : null;
  }
  // credential: a string sets+encrypts; explicit null clears; absent = unchanged.
  if (body?.credential !== undefined) {
    patch.credential =
      typeof body.credential === 'string' && body.credential ? body.credential : null;
  }

  const ok = await updateConnector(params.id, patch);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(auth.userId, 'connector.updated', {
    targetType: 'mcp_connector',
    targetId: params.id,
    metadata: { fields: Object.keys(patch), credentialChanged: 'credential' in patch },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ id: params.id });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const auth = await requireAdmin(hdrs);
  if ('response' in auth) return auth.response;

  const ok = await deleteConnector(params.id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(auth.userId, 'connector.deleted', {
    targetType: 'mcp_connector',
    targetId: params.id,
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ ok: true });
}
