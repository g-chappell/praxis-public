// Per-project MCP usage capping (STORY-15/TASK-043). The in-sandbox MCP server
// has NO database access (no creds in the sandbox); it presents its room's
// capability token to POST /internal/mcp/usage, and the orchestrator does the
// cap-check here against the mcp_usage table.

import { sql } from 'drizzle-orm';

import { mcpUsage } from '@praxis/db';
import { db } from '@praxis/db/client';

/** Default per-project, per-day cap for image generation. */
export const MCP_IMAGE_CAP = Number(process.env.MCP_IMAGE_CAP ?? 50);

export interface UsageResult {
  allowed: boolean;
  count: number;
  cap: number;
}

/** Atomically increment a project's per-day count for `tool`, but only while it's
 *  under `cap`. The conflict-update fires only when count < cap, so the (cap+1)th
 *  call of the day updates no row → returns [] → denied. One round-trip, race-safe. */
export async function checkAndIncrement(
  projectId: string,
  tool: string,
  cap: number,
): Promise<UsageResult> {
  if (cap <= 0) return { allowed: false, count: 0, cap };
  const rows = await db
    .insert(mcpUsage)
    .values({ projectId, tool, day: sql`CURRENT_DATE`, count: 1 })
    .onConflictDoUpdate({
      target: [mcpUsage.projectId, mcpUsage.tool, mcpUsage.day],
      set: { count: sql`${mcpUsage.count} + 1` },
      setWhere: sql`${mcpUsage.count} < ${cap}`,
    })
    .returning({ count: mcpUsage.count });
  if (rows.length === 0) return { allowed: false, count: cap, cap };
  return { allowed: true, count: rows[0]!.count, cap };
}
