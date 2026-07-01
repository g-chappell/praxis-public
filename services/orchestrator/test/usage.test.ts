// Usage metering (STORY-22). Pure cost-estimate test + a real-DB test that a
// completed turn writes a usage_events row with the reported tokens (gated by
// RUN_DB_TESTS).

import { randomUUID } from 'node:crypto';

import { projects, sessions, teamMemberships, teams, usageEvents, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { estimateCostUsd, projectBudgetStatus, recordTurnUsage } from '../src/usage';

describe('estimateCostUsd', () => {
  it('applies the per-million-token rates (3 in / 15 out)', () => {
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBeCloseTo(18, 6);
    expect(estimateCostUsd(0, 0)).toBe(0);
    expect(estimateCostUsd(500_000, 0)).toBeCloseTo(1.5, 6);
  });
});

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedSession(db: TestDb): Promise<{ projectId: string; sessionId: string }> {
  const [u] = await db
    .insert(users)
    .values({ email: `usage-${randomUUID()}@example.test` })
    .returning({ id: users.id });
  const [team] = await db
    .insert(teams)
    .values({ name: 't', createdBy: u!.id })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: u!.id });
  const [project] = await db
    .insert(projects)
    .values({ teamId: team!.id, name: 'p', templateId: 'react-threejs-scene', createdBy: u!.id })
    .returning({ id: projects.id });
  const [session] = await db
    .insert(sessions)
    .values({ projectId: project!.id })
    .returning({ id: sessions.id });
  return { projectId: project!.id, sessionId: session!.id };
}

describeDb('recordTurnUsage (real DB)', () => {
  it('writes a usage row with the reported tokens + estimated cost', async () => {
    await withDb(async (db) => {
      const { projectId, sessionId } = await seedSession(db);
      await recordTurnUsage(projectId, sessionId, { inputTokens: 1200, outputTokens: 800 }, db);

      const rows = await db.select().from(usageEvents).where(eq(usageEvents.projectId, projectId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.inputTokens).toBe(1200);
      expect(rows[0]!.outputTokens).toBe(800);
      expect(rows[0]!.sessionId).toBe(sessionId);
      expect(Number(rows[0]!.estimatedCostUsd)).toBeCloseTo(estimateCostUsd(1200, 800), 6);
    });
  });
});

describeDb('projectBudgetStatus (real DB)', () => {
  it('is under budget by default, over once cost reaches the cap', async () => {
    await withDb(async (db) => {
      const { projectId, sessionId } = await seedSession(db); // default budget 10.00

      const under = await projectBudgetStatus(projectId, db);
      expect(under.budgetUsd).toBe(10);
      expect(under.over).toBe(false);

      // Lower the budget under the recorded cost → over.
      await db.update(projects).set({ budgetUsd: '0.01' }).where(eq(projects.id, projectId));
      await db.insert(usageEvents).values({
        projectId,
        sessionId,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: '0.05',
      });
      const over = await projectBudgetStatus(projectId, db);
      expect(over.over).toBe(true);
      expect(over.usedUsd).toBeCloseTo(0.05, 6);
    });
  });
});
