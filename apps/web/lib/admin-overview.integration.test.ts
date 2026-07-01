// Persistence tests for the admin overview aggregate (STORY-48). Real Postgres
// (tier-3), gated behind RUN_DB_TESTS=1. The orchestrator env is unset here so
// the health field degrades to null (graceful-degradation path).

import { randomUUID } from 'node:crypto';

import { auditLog, projects, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminOverview } from './admin-overview';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

let savedUrl: string | undefined;
beforeEach(() => {
  savedUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  delete process.env.ORCHESTRATOR_INTERNAL_URL; // force the degraded health path
});
afterEach(() => {
  if (savedUrl !== undefined) process.env.ORCHESTRATOR_INTERNAL_URL = savedUrl;
});

async function seedProject(db: TestDb, ownerId: string, archived: boolean): Promise<void> {
  const [team] = await db
    .insert(teams)
    .values({ name: `t-${randomUUID()}`, createdBy: ownerId })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: ownerId });
  await db.insert(projects).values({
    teamId: team!.id,
    name: `p-${randomUUID()}`,
    templateId: 'react-threejs-scene',
    createdBy: ownerId,
    archivedAt: archived ? new Date() : null,
  });
}

describeDb('adminOverview (real DB)', () => {
  it('aggregates counts + recent actions, key status, and degrades orchestrator to null', async () => {
    await withDb(async (db) => {
      const [owner] = await db
        .insert(users)
        .values({ email: `ov-${randomUUID()}@example.test` })
        .returning({ id: users.id });
      await seedProject(db, owner!.id, false);
      await seedProject(db, owner!.id, false);
      await seedProject(db, owner!.id, true);
      await db.insert(auditLog).values({
        actorUserId: owner!.id,
        action: 'project.deleted',
        targetType: 'project',
        targetId: randomUUID(),
      });

      const ov = await adminOverview(db);

      // Counts reflect at least what we seeded (the DB accumulates across tests).
      expect(ov.counts.users).toBeGreaterThanOrEqual(1);
      expect(ov.counts.projectsActive).toBeGreaterThanOrEqual(2);
      expect(ov.counts.projectsArchived).toBeGreaterThanOrEqual(1);

      // Both providers reported, not configured (no active key rows seeded).
      expect(ov.keys.map((k) => k.provider).sort()).toEqual(['anthropic', 'openai']);
      expect(ov.keys.every((k) => k.configured === false)).toBe(true);

      // Recent actions present; orchestrator degraded (env unset).
      expect(ov.recentActions.length).toBeGreaterThan(0);
      expect(ov.orchestrator).toBeNull();
    });
  });
});
