// POST /api/admin/api-keys — set / rotate / deactivate a platform API key
// (STORY-21 / STORY-38). Admin-only. `provider` selects Anthropic (default) or
// OpenAI. The raw key is encrypted by setActivePlatformKey before it touches the
// DB and is NEVER echoed back or logged — the response carries masked metadata
// only. `{ action: 'deactivate' }` turns the provider's key off (no key needed).

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import {
  type KeyProvider,
  deactivateActivePlatformKey,
  getActivePlatformKeyMeta,
  setActivePlatformKey,
} from '@praxis/keys';

import { isUserAdmin } from '@/lib/admin';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Boundary validation only (like the rest of the codebase): Anthropic keys carry
// the `sk-ant-` prefix; OpenAI keys start with `sk-` (covers `sk-` and the newer
// `sk-proj-`). Not a liveness check.
const KEY_PREFIX: Record<KeyProvider, string> = { anthropic: 'sk-ant-', openai: 'sk-' };

export async function POST(req: NextRequest) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    provider?: unknown;
    action?: unknown;
  } | null;
  const provider: KeyProvider = body?.provider === 'openai' ? 'openai' : 'anthropic';

  if (body?.action === 'deactivate') {
    await deactivateActivePlatformKey(provider);
    await recordAudit(session.user.id, 'api_key.rotated', {
      targetType: 'platform_api_key',
      targetId: provider,
      metadata: { provider, action: 'deactivated' },
      ip: clientIp(hdrs),
    });
    return NextResponse.json({ ok: true, meta: null });
  }

  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return NextResponse.json({ error: 'missing_key' }, { status: 400 });
  }
  if (!key.startsWith(KEY_PREFIX[provider])) {
    return NextResponse.json({ error: 'invalid_key_format' }, { status: 400 });
  }

  await setActivePlatformKey(key, session.user.id, provider);
  const meta = await getActivePlatformKeyMeta(provider);
  // Audit the rotation (masked key only — never the raw secret).
  await recordAudit(session.user.id, 'api_key.rotated', {
    targetType: 'platform_api_key',
    targetId: provider,
    metadata: { provider, ...(meta ? { maskedKey: meta.maskedKey } : {}) },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ ok: true, meta });
}
