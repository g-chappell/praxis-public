// Audit log helper (STORY-43) — the accountability backbone. Every wired
// admin/destructive action appends an append-only audit_log row *alongside*
// (never replacing) its existing console.info stdout log. The insert is
// best-effort: a failure is logged and swallowed so the underlying action is
// never broken by an audit hiccup. Query helpers expose the three dimensions
// the viewer (STORY-47) needs: by actor, by target (type+id), and by time.

import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { type AuditLog, auditAction, auditLog } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

/** The audited actions — the audit_action pgEnum's value union. */
export type AuditAction = (typeof auditAction.enumValues)[number];

/** Best-effort client IP from the proxy headers (Caddy sets x-forwarded-for). */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim() || null;
  return headers.get('x-real-ip');
}

export interface RecordAuditInput {
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/** Append an audit_log row for an admin/destructive action. Best-effort: never
 *  throws — an insert failure is logged and swallowed so the caller's action is
 *  never 500'd by an audit hiccup. The `database` is injectable for tests. */
export async function recordAudit(
  actorUserId: string,
  action: AuditAction,
  input: RecordAuditInput,
  database: Database = db,
): Promise<void> {
  try {
    await database.insert(auditLog).values({
      actorUserId,
      action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? null,
      ip: input.ip ?? null,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'audit.record_failed',
        action,
        targetType: input.targetType,
        targetId: input.targetId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/** Audit rows written by an actor, newest first. */
export async function queryAuditByActor(
  actorUserId: string,
  limit = 100,
  database: Database = db,
): Promise<AuditLog[]> {
  return database
    .select()
    .from(auditLog)
    .where(eq(auditLog.actorUserId, actorUserId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Audit rows for a target (type + id), newest first. */
export async function queryAuditByTarget(
  targetType: string,
  targetId: string,
  limit = 100,
  database: Database = db,
): Promise<AuditLog[]> {
  return database
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.targetType, targetType), eq(auditLog.targetId, targetId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Audit rows created within `[from, to]` (inclusive), newest first. */
export async function queryAuditByTimeRange(
  from: Date,
  to: Date,
  limit = 100,
  database: Database = db,
): Promise<AuditLog[]> {
  return database
    .select()
    .from(auditLog)
    .where(and(gte(auditLog.createdAt, from), lte(auditLog.createdAt, to)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
