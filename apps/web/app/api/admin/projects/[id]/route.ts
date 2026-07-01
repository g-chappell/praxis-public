// PATCH/DELETE /api/admin/projects/[id] — admin moderation of ANY project
// (STORY-44). Authorized by isUserAdmin (NOT userOwnsProject — admins bypass
// ownership). A reason is required and recorded in the audit_log metadata. DELETE
// destroys the sandbox via the orchestrator (same cleanup as the owner path)
// before removing the DB rows.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import {
  adminDeleteProject,
  adminSetProjectArchived,
  adminSetProjectBudget,
} from '@/lib/admin-projects';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';
import { parseBudgetUsd } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REASON_MAX = 500;

/** A non-empty, length-bounded moderation reason, or null when missing/invalid. */
function parseReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const reason = value.trim();
  if (!reason || reason.length > REASON_MAX) return null;
  return reason;
}

type AdminAuth = { userId: string } | { response: NextResponse };

async function requireAdmin(hdrs: Headers): Promise<AdminAuth> {
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return { response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!(await isUserAdmin(session.user.id))) {
    return { response: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const auth = await requireAdmin(hdrs);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as {
    archived?: unknown;
    reason?: unknown;
    budgetUsd?: unknown;
  } | null;

  // Admin budget override (STORY-23) — no reason required.
  if (body?.budgetUsd !== undefined) {
    const budget = parseBudgetUsd(body.budgetUsd);
    if (budget === null) return NextResponse.json({ error: 'invalid_budget' }, { status: 400 });
    const ok = await adminSetProjectBudget(params.id, budget);
    if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await recordAudit(auth.userId, 'project.updated', {
      targetType: 'project',
      targetId: params.id,
      metadata: { budgetUsd: budget, admin: true },
      ip: clientIp(hdrs),
    });
    return NextResponse.json({ id: params.id, budgetUsd: budget });
  }

  if (typeof body?.archived !== 'boolean') {
    return NextResponse.json({ error: 'invalid_archived' }, { status: 400 });
  }
  const reason = parseReason(body?.reason);
  if (!reason) return NextResponse.json({ error: 'reason_required' }, { status: 400 });

  const ok = await adminSetProjectArchived(params.id, body.archived);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(auth.userId, body.archived ? 'project.archived' : 'project.restored', {
    targetType: 'project',
    targetId: params.id,
    metadata: { reason, admin: true },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ id: params.id, archived: body.archived });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const auth = await requireAdmin(hdrs);
  if ('response' in auth) return auth.response;

  const body = (await req.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = parseReason(body?.reason);
  if (!reason) return NextResponse.json({ error: 'reason_required' }, { status: 400 });

  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!orchestratorUrl || !internalSecret) {
    return NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 });
  }

  // Destroy the sandbox first — if it fails we keep the DB row so the action can
  // be retried rather than orphaning a container/volume (mirrors the owner path).
  const res = await fetch(`${orchestratorUrl}/projects/${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
    headers: { 'x-internal-secret': internalSecret },
  }).catch(() => null);
  if (!res || !res.ok) {
    return NextResponse.json({ error: 'sandbox_destroy_failed' }, { status: 502 });
  }

  const ok = await adminDeleteProject(params.id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(auth.userId, 'project.deleted', {
    targetType: 'project',
    targetId: params.id,
    metadata: { reason, admin: true },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ ok: true });
}
