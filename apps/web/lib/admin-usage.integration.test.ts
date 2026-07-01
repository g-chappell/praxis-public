// Persistence tests for the admin usage aggregation (STORY-49/TASK-145). Real
// Postgres (tier-3), gated behind RUN_DB_TESTS=1. Seeds usage_events and asserts
// aggregation by project, by owner, total, and over a time window.

import { randomUUID } from 'node:crypto';

import { projects, sessions, teamMemberships, teams, usageEvents, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { describe, expect, it } from 'vitest';

import { adminUsageOverview } from './admin-usage';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedOwnerProject(
  db: TestDb,
  name: string,
): Promise<{ ownerId: string; ownerEmail: string; projectId: string; sessionId: string }> {
  const email = `usg-${randomUUID()}@example.test`;
  const [u] = await db.insert(users).values({ email }).returning({ id: users.id });
  const [team] = await db
    .insert(teams)
    .values({ name: 't', createdBy: u!.id })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: u!.id });
  const [p] = await db
    .insert(projects)
    .values({ teamId: team!.id, name, templateId: 'react-threejs-scene', createdBy: u!.id })
    .returning({ id: projects.id });
  const [s] = await db.insert(sessions).values({ projectId: p!.id }).returning({ id: sessions.id });
  return { ownerId: u!.id, ownerEmail: email, projectId: p!.id, sessionId: s!.id };
}

describeDb('adminUsageOverview (real DB)', () => {
  it('aggregates by project, by owner, total, and respects the window', async () => {
    await withDb(async (db) => {
      const a = await seedOwnerProject(db, `A-${randomUUID().slice(0, 6)}`);
      const b = await seedOwnerProject(db, `B-${randomUUID().slice(0, 6)}`);

      // Project A: two rows (one in window, one before). Project B: one in window.
      const inWindow = new Date('2026-06-15T00:00:00Z');
      const before = new Date('2026-05-01T00:00:00Z');
      await db.insert(usageEvents).values([
        {
          projectId: a.projectId,
          sessionId: a.sessionId,
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: '0.10',
          createdAt: inWindow,
        },
        {
          projectId: a.projectId,
          sessionId: a.sessionId,
          inputTokens: 999,
          outputTokens: 999,
          estimatedCostUsd: '9.99',
          createdAt: before,
        },
        {
          projectId: b.projectId,
          sessionId: b.sessionId,
          inputTokens: 200,
          outputTokens: 100,
          estimatedCostUsd: '0.20',
          createdAt: inWindow,
        },
      ]);

      const ov = await adminUsageOverview(
        { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-06-30T00:00:00Z') },
        db,
      );

      // Window excludes the May row → total cost = 0.10 + 0.20 (across our + others).
      const aProj = ov.byProject.find((r) => r.projectId === a.projectId)!;
      const bProj = ov.byProject.find((r) => r.projectId === b.projectId)!;
      expect(aProj.estimatedCostUsd).toBeCloseTo(0.1, 6); // May row excluded
      expect(aProj.turns).toBe(1);
      expect(aProj.inputTokens).toBe(100);
      expect(aProj.ownerEmail).toBe(a.ownerEmail);
      expect(bProj.estimatedCostUsd).toBeCloseTo(0.2, 6);

      // Per-owner aggregation (by createdBy).
      const aOwner = ov.byUser.find((r) => r.ownerId === a.ownerId)!;
      expect(aOwner.email).toBe(a.ownerEmail);
      expect(aOwner.estimatedCostUsd).toBeCloseTo(0.1, 6);

      // Total includes at least our two in-window rows.
      expect(ov.total.estimatedCostUsd).toBeGreaterThanOrEqual(0.3 - 1e-9);
    });
  });
});
