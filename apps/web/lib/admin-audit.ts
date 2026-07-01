// Admin audit-log query (STORY-47). Admin-scoped read over audit_log with
// composable filters + pagination, joining the actor's email for display. Gate on
// isUserAdmin at the route.

import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { auditAction, auditLog, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

export const AUDIT_ACTIONS = auditAction.enumValues;
export type AuditActionValue = (typeof AUDIT_ACTIONS)[number];

/** Narrow an untrusted ?action value to a known audit action, or undefined. */
export function parseAuditAction(value: unknown): AuditActionValue | undefined {
  return typeof value === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(value)
    ? (value as AuditActionValue)
    : undefined;
}

export interface AuditFilters {
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  action?: AuditActionValue;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorUserId: string;
  actorEmail: string | null;
  targetType: string;
  targetId: string;
  metadata: unknown;
  ip: string | null;
  createdAt: Date | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Clamp an untrusted page size into [1, MAX_LIMIT]. */
export function parseAuditLimit(value: unknown): number {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/** Audit entries newest-first matching the (composable) filters, plus the total
 *  match count for pagination. The `database` is injectable for tests. */
export async function adminQueryAudit(
  filters: AuditFilters = {},
  database: Database = db,
): Promise<{ entries: AuditEntry[]; total: number }> {
  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(filters.offset ?? 0, 0);

  const conds: SQL[] = [];
  if (filters.actorUserId) conds.push(eq(auditLog.actorUserId, filters.actorUserId));
  if (filters.targetType) conds.push(eq(auditLog.targetType, filters.targetType));
  if (filters.targetId) conds.push(eq(auditLog.targetId, filters.targetId));
  if (filters.action) conds.push(eq(auditLog.action, filters.action));
  if (filters.from) conds.push(gte(auditLog.createdAt, filters.from));
  if (filters.to) conds.push(lte(auditLog.createdAt, filters.to));
  const where = conds.length ? and(...conds) : undefined;

  const entries = await database
    .select({
      id: auditLog.id,
      action: auditLog.action,
      actorUserId: auditLog.actorUserId,
      actorEmail: users.email,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);

  const [count] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(where);

  return { entries, total: count?.total ?? 0 };
}
