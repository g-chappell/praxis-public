// Persistence tests for the audit log (STORY-43). Real Postgres (tier-3: no DB
// mocks), gated behind RUN_DB_TESTS=1 so CI without a database still passes.
// Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/audit.integration

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { queryAuditByActor, queryAuditByTarget, queryAuditByTimeRange, recordAudit } from './audit';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `audit-${randomUUID()}@example.test` })
    .returning({ id: users.id });
  return u!.id;
}

describeDb('audit log persistence (real DB)', () => {
  it('recordAudit writes a row with the given actor/action/target/metadata/ip', async () => {
    await withDb(async (db) => {
      const actor = await seedUser(db);
      const targetId = `proj-${randomUUID()}`;

      await recordAudit(
        actor,
        'project.deleted',
        { targetType: 'project', targetId, metadata: { reason: 'cleanup' }, ip: '203.0.113.7' },
        db,
      );

      const rows = await queryAuditByActor(actor, 100, db);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorUserId: actor,
        action: 'project.deleted',
        targetType: 'project',
        targetId,
        metadata: { reason: 'cleanup' },
        ip: '203.0.113.7',
      });
      expect(rows[0]!.createdAt).toBeInstanceOf(Date);
    });
  });

  it('is queryable by actor, by target (type+id), and by time range', async () => {
    await withDb(async (db) => {
      const actor = await seedUser(db);
      const other = await seedUser(db);
      const targetId = `proj-${randomUUID()}`;

      // Two rows by `actor` on the same target, one unrelated row by `other`.
      await recordAudit(actor, 'project.updated', { targetType: 'project', targetId }, db);
      await recordAudit(actor, 'project.archived', { targetType: 'project', targetId }, db);
      await recordAudit(
        other,
        'api_key.rotated',
        { targetType: 'platform_api_key', targetId: 'platform' },
        db,
      );

      // by actor — only `actor`'s two rows
      const byActor = await queryAuditByActor(actor, 100, db);
      expect(byActor.map((r) => r.action).sort()).toEqual(['project.archived', 'project.updated']);

      // by target (type + id) — both rows on this project, neither the api-key row
      const byTarget = await queryAuditByTarget('project', targetId, 100, db);
      expect(byTarget).toHaveLength(2);
      expect(byTarget.every((r) => r.targetId === targetId)).toBe(true);

      // by time range — a window around now captures all three; a past window none
      const now = Date.now();
      const recent = await queryAuditByTimeRange(
        new Date(now - 60_000),
        new Date(now + 60_000),
        100,
        db,
      );
      const recentIds = new Set(recent.map((r) => r.actorUserId));
      expect(recentIds.has(actor)).toBe(true);
      expect(recentIds.has(other)).toBe(true);

      const past = await queryAuditByTimeRange(
        new Date(now - 7_200_000),
        new Date(now - 3_600_000),
        100,
        db,
      );
      expect(past.some((r) => r.actorUserId === actor || r.actorUserId === other)).toBe(false);
    });
  });
});
