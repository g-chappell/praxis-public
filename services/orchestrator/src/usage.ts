// Per-turn usage metering (STORY-22) + budget enforcement (STORY-23). Records a
// usage_events row from each completed agent turn (the token usage AcpHost
// surfaces on turn-complete, ADR-0009), and exposes the project's budget status
// so prompts can be paused when over. Best-effort recording: a metering failure
// must never break the turn.

import { eq, sql } from 'drizzle-orm';

import { projects, usageEvents } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

import { logger } from './logger';

// Estimated cost ONLY — ACP doesn't expose the agent's model, so we apply a
// documented list rate (USD per 1M tokens). Assumes Claude Sonnet-class pricing;
// revisit if the model or pricing changes. The estimate is recorded per row so
// historical rows keep the rate they were costed at.
const INPUT_USD_PER_MTOK = 3;
const OUTPUT_USD_PER_MTOK = 15;

export function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK
  );
}

/** Record a completed turn's token usage. Best-effort — logs and swallows on
 *  failure so a metering hiccup never fails the turn. The `database` is
 *  injectable for persistence tests. */
export async function recordTurnUsage(
  projectId: string,
  sessionId: string,
  usage: { inputTokens: number; outputTokens: number },
  database: Database = db,
): Promise<void> {
  try {
    const cost = estimateCostUsd(usage.inputTokens, usage.outputTokens);
    await database.insert(usageEvents).values({
      projectId,
      sessionId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: cost.toFixed(6),
    });
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'usage.record_failed',
    );
  }
}

export interface BudgetStatus {
  over: boolean;
  usedUsd: number;
  budgetUsd: number;
}

/** Whether a project has reached its budget cap (STORY-23). Compares cumulative
 *  estimated cost (sum of usage_events) to projects.budget_usd, read fresh so a
 *  raised budget resumes prompting immediately. A missing project never blocks. */
export async function projectBudgetStatus(
  projectId: string,
  database: Database = db,
): Promise<BudgetStatus> {
  const [project] = await database
    .select({ budgetUsd: projects.budgetUsd })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { over: false, usedUsd: 0, budgetUsd: 0 };

  const [row] = await database
    .select({ used: sql<string>`coalesce(sum(${usageEvents.estimatedCostUsd}), 0)` })
    .from(usageEvents)
    .where(eq(usageEvents.projectId, projectId));

  const budgetUsd = Number(project.budgetUsd);
  const usedUsd = Number(row?.used ?? 0);
  return { over: usedUsd >= budgetUsd, usedUsd, budgetUsd };
}
