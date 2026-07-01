// Persistence tests for the project usage summary (STORY-22). Real Postgres
// (tier-3), gated behind RUN_DB_TESTS=1.

import { randomUUID } from 'node:crypto';

import { projects, sessions, teamMemberships, teams, usageEvents, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { projectUsage } from './usage';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedOwnedProject(
  db: TestDb,
): Promise<{ ownerId: string; projectId: string; sessionId: string }> {
  const [u] = await db
    .insert(users)
    .values({ email: `use-${randomUUID()}@example.test` })
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
  return { ownerId: u!.id, projectId: project!.id, sessionId: session!.id };
}

describeDb('projectUsage (real DB)', () => {
  it('sums tokens + cost across usage rows for a member; null for a non-member', async () => {
    await withDb(async (db) => {
      const { ownerId, projectId, sessionId } = await seedOwnedProject(db);
      await db.insert(usageEvents).values([
        { projectId, sessionId, inputTokens: 100, outputTokens: 40, estimatedCostUsd: '0.001' },
        { projectId, sessionId, inputTokens: 200, outputTokens: 60, estimatedCostUsd: '0.002' },
      ]);

      const usage = await projectUsage(ownerId, projectId, db);
      expect(usage).not.toBeNull();
      expect(usage!.inputTokens).toBe(300);
      expect(usage!.outputTokens).toBe(100);
      expect(usage!.estimatedCostUsd).toBeCloseTo(0.003, 6);
      expect(usage!.turns).toBe(2);
      // Default budget (10.00) far exceeds the tiny cost → not over budget.
      expect(usage!.budgetUsd).toBe(10);
      expect(usage!.overBudget).toBe(false);

      // A stranger (not a team member) gets null.
      const [stranger] = await db
        .insert(users)
        .values({ email: `stranger-${randomUUID()}@example.test` })
        .returning({ id: users.id });
      expect(await projectUsage(stranger!.id, projectId, db)).toBeNull();
    });
  });

  it('returns zeros (under budget) for a member with no usage yet', async () => {
    await withDb(async (db) => {
      const { ownerId, projectId } = await seedOwnedProject(db);
      const usage = await projectUsage(ownerId, projectId, db);
      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        turns: 0,
        budgetUsd: 10,
        overBudget: false,
      });
    });
  });

  it('flags overBudget once cost reaches the (lowered) budget', async () => {
    await withDb(async (db) => {
      const { ownerId, projectId, sessionId } = await seedOwnedProject(db);
      await db.update(projects).set({ budgetUsd: '0.01' }).where(eq(projects.id, projectId));
      await db.insert(usageEvents).values({
        projectId,
        sessionId,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: '0.02',
      });

      const usage = await projectUsage(ownerId, projectId, db);
      expect(usage!.budgetUsd).toBe(0.01);
      expect(usage!.overBudget).toBe(true);
    });
  });
});
