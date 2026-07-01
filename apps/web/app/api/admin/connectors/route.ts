// GET/POST /api/admin/connectors — MCP connector catalog (STORY-50, ADR-0020).
// Admin-only. Credentials are write-only (never returned). command_ref must be a
// known allow-listed ref.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { createConnector, listConnectors } from '@/lib/admin-connectors';
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

export async function GET() {
  const auth = await requireAdmin(await headers());
  if ('response' in auth) return auth.response;
  return NextResponse.json({ connectors: await listConnectors() });
}

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const auth = await requireAdmin(hdrs);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    commandRef?: unknown;
    args?: unknown;
    usageCap?: unknown;
    credential?: unknown;
  } | null;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const commandRef = typeof body?.commandRef === 'string' ? body.commandRef : '';
  if (!name || name.length > 64)
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  const usageCap =
    typeof body?.usageCap === 'number' && body.usageCap >= 0 ? Math.floor(body.usageCap) : null;
  const credential =
    typeof body?.credential === 'string' && body.credential ? body.credential : null;

  const result = await createConnector(
    { name, commandRef, args: body?.args ?? null, usageCap, credential },
    auth.userId,
  );
  if ('error' in result) {
    const status = result.error === 'name_taken' ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordAudit(auth.userId, 'connector.created', {
    targetType: 'mcp_connector',
    targetId: result.id,
    metadata: { name, commandRef, hasCredential: credential !== null, usageCap },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
