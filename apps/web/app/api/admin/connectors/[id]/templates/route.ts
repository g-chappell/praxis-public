// PUT /api/admin/connectors/[id]/templates — enable/disable a connector for a
// template + set its allowed commands (STORY-50, ADR-0020). Admin-only, audited.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { setTemplateConnector } from '@/lib/admin-connectors';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    templateId?: unknown;
    enabled?: unknown;
    allowedCommands?: unknown;
  } | null;
  const templateId = typeof body?.templateId === 'string' ? body.templateId.trim() : '';
  if (!templateId) return NextResponse.json({ error: 'invalid_template' }, { status: 400 });
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid_enabled' }, { status: 400 });
  }
  const allowedCommands = Array.isArray(body?.allowedCommands)
    ? body.allowedCommands.filter((c): c is string => typeof c === 'string')
    : null;

  const ok = await setTemplateConnector(params.id, templateId, {
    enabled: body.enabled,
    allowedCommands,
  });
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(session.user.id, 'connector.template_changed', {
    targetType: 'mcp_connector',
    targetId: params.id,
    metadata: { templateId, enabled: body.enabled, allowedCommands },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ ok: true });
}
