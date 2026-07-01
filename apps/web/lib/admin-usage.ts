// Admin-wide usage & cost aggregation (STORY-49) over usage_events (STORY-22).
// Admin-scoped — gate on isUserAdmin at the route. Aggregates total platform
// spend plus per-project and per-"user" usage over a time window. NOTE:
// usage_events has no user_id (the row is per project+session), so per-user is
// attributed to the project OWNER (projects.created_by) — real data in the app's
// team-ownership model, not a placeholder.

import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { projects, usageEvents, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  turns: number;
}

export interface ProjectUsageRow extends UsageTotals {
  projectId: string;
  name: string;
  ownerEmail: string | null;
  budgetUsd: number;
}

export interface UserUsageRow extends UsageTotals {
  ownerId: string | null;
  email: string | null;
}

export interface AdminUsageOverview {
  total: UsageTotals;
  byProject: ProjectUsageRow[];
  byUser: UserUsageRow[];
}

const TOP_N = 20;

function windowWhere(from?: Date, to?: Date): SQL | undefined {
  const conds: SQL[] = [];
  if (from) conds.push(gte(usageEvents.createdAt, from));
  if (to) conds.push(lte(usageEvents.createdAt, to));
  return conds.length ? and(...conds) : undefined;
}

const sumInput = sql<string>`coalesce(sum(${usageEvents.inputTokens}), 0)`;
const sumOutput = sql<string>`coalesce(sum(${usageEvents.outputTokens}), 0)`;
const sumCost = sql<string>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)`;
const turnCount = sql<number>`count(*)::int`;

function totals(row: { input: string; output: string; cost: string; turns: number }): UsageTotals {
  return {
    inputTokens: Number(row.input),
    outputTokens: Number(row.output),
    estimatedCostUsd: Number(row.cost),
    turns: row.turns,
  };
}

/** Aggregate usage over the window: platform total + top projects + top owners by
 *  spend. The `database` is injectable for tests. */
export async function adminUsageOverview(
  opts: { from?: Date; to?: Date } = {},
  database: Database = db,
): Promise<AdminUsageOverview> {
  const where = windowWhere(opts.from, opts.to);

  const [totalRow] = await database
    .select({ input: sumInput, output: sumOutput, cost: sumCost, turns: turnCount })
    .from(usageEvents)
    .where(where);

  const byProject = await database
    .select({
      projectId: usageEvents.projectId,
      name: projects.name,
      ownerEmail: users.email,
      budgetUsd: projects.budgetUsd,
      input: sumInput,
      output: sumOutput,
      cost: sumCost,
      turns: turnCount,
    })
    .from(usageEvents)
    .innerJoin(projects, eq(projects.id, usageEvents.projectId))
    .leftJoin(users, eq(users.id, projects.createdBy))
    .where(where)
    .groupBy(usageEvents.projectId, projects.name, users.email, projects.budgetUsd)
    .orderBy(desc(sumCost))
    .limit(TOP_N);

  const byUser = await database
    .select({
      ownerId: projects.createdBy,
      email: users.email,
      input: sumInput,
      output: sumOutput,
      cost: sumCost,
      turns: turnCount,
    })
    .from(usageEvents)
    .innerJoin(projects, eq(projects.id, usageEvents.projectId))
    .leftJoin(users, eq(users.id, projects.createdBy))
    .where(where)
    .groupBy(projects.createdBy, users.email)
    .orderBy(desc(sumCost))
    .limit(TOP_N);

  return {
    total: totals(totalRow ?? { input: '0', output: '0', cost: '0', turns: 0 }),
    byProject: byProject.map((r) => ({
      ...totals(r),
      projectId: r.projectId,
      name: r.name,
      ownerEmail: r.ownerEmail,
      budgetUsd: Number(r.budgetUsd),
    })),
    byUser: byUser.map((r) => ({ ...totals(r), ownerId: r.ownerId, email: r.email })),
  };
}
