// Admin overview aggregate (STORY-48): platform counts, per-provider key status,
// recent admin actions, and live orchestrator health. Admin-scoped — gate at the
// route. The orchestrator call is best-effort: if it's unreachable the field is
// null and the UI degrades that tile rather than failing the page.

import { sql } from 'drizzle-orm';

import { projects, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';
import { getActivePlatformKeyMeta, type KeyProvider } from '@praxis/keys';

import { adminQueryAudit, type AuditEntry } from './admin-audit';

const PROVIDERS: KeyProvider[] = ['anthropic', 'openai'];

export interface OrchestratorStats {
  runningSandboxes: number | null;
  gitSha: string;
  uptimeSec: number;
}

export interface KeyStatus {
  provider: KeyProvider;
  configured: boolean;
  maskedKey: string | null;
  lastRotatedAt: Date | null;
}

export interface AdminOverview {
  counts: { users: number; projectsActive: number; projectsArchived: number };
  keys: KeyStatus[];
  recentActions: AuditEntry[];
  /** Live orchestrator health, or null when it's unreachable (degraded tile). */
  orchestrator: OrchestratorStats | null;
}

/** Fetch the orchestrator's /admin/stats; null on any failure (down, timeout,
 *  unconfigured) so the caller degrades gracefully rather than 500ing. */
async function fetchOrchestratorStats(): Promise<OrchestratorStats | null> {
  const url = process.env.ORCHESTRATOR_INTERNAL_URL;
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!url || !secret) return null;
  try {
    const res = await fetch(`${url}/admin/stats`, {
      headers: { 'x-internal-secret': secret },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as OrchestratorStats;
  } catch {
    return null;
  }
}

export async function adminOverview(database: Database = db): Promise<AdminOverview> {
  const [[userRow], [projectRow], recent, orchestrator, ...keyMetas] = await Promise.all([
    database.select({ n: sql<number>`count(*)::int` }).from(users),
    database
      .select({
        active: sql<number>`count(*) filter (where ${projects.archivedAt} is null)::int`,
        archived: sql<number>`count(*) filter (where ${projects.archivedAt} is not null)::int`,
      })
      .from(projects),
    adminQueryAudit({ limit: 5 }, database),
    fetchOrchestratorStats(),
    ...PROVIDERS.map((p) => getActivePlatformKeyMeta(p, database)),
  ]);

  const keys: KeyStatus[] = PROVIDERS.map((provider, i) => {
    const meta = keyMetas[i];
    return {
      provider,
      configured: meta !== null,
      maskedKey: meta?.maskedKey ?? null,
      lastRotatedAt: meta?.lastRotatedAt ?? null,
    };
  });

  return {
    counts: {
      users: userRow?.n ?? 0,
      projectsActive: projectRow?.active ?? 0,
      projectsArchived: projectRow?.archived ?? 0,
    },
    keys,
    recentActions: recent.entries,
    orchestrator,
  };
}
