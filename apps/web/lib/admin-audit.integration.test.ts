// Persistence tests for the admin audit query (STORY-47). Real Postgres (tier-3),
// gated behind RUN_DB_TESTS=1.

import { randomUUID } from 'node:crypto';

import { auditLog, users } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';
import { describe, expect, it } from 'vitest';

import { adminQueryAudit } from './admin-audit';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('adminQueryAudit (real DB)', () => {
  it('filters by actor/target/action, joins actor email, paginates newest-first', async () => {
    await withDb(async (db) => {
      const [actor] = await db
        .insert(users)
        .values({ email: `auditor-${randomUUID()}@example.test` })
        .returning({ id: users.id, email: users.email });
      const target = randomUUID();

      // Three rows for this actor+target, distinct actions/times.
      await db.insert(auditLog).values([
        {
          actorUserId: actor!.id,
          action: 'project.archived',
          targetType: 'project',
          targetId: target,
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
        {
          actorUserId: actor!.id,
          action: 'project.restored',
          targetType: 'project',
          targetId: target,
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
        {
          actorUserId: actor!.id,
          action: 'project.deleted',
          targetType: 'project',
          targetId: target,
          createdAt: new Date('2026-06-03T00:00:00Z'),
        },
      ]);

      // Scoped to this target → exactly our 3, newest-first, with actor email.
      const byTarget = await adminQueryAudit({ targetType: 'project', targetId: target }, db);
      expect(byTarget.total).toBe(3);
      expect(byTarget.entries.map((e) => e.action)).toEqual([
        'project.deleted',
        'project.restored',
        'project.archived',
      ]);
      expect(byTarget.entries[0]!.actorEmail).toBe(actor!.email);

      // Action filter.
      const deleted = await adminQueryAudit({ targetId: target, action: 'project.deleted' }, db);
      expect(deleted.total).toBe(1);

      // Time range (only the middle row).
      const ranged = await adminQueryAudit(
        {
          targetId: target,
          from: new Date('2026-06-01T12:00:00Z'),
          to: new Date('2026-06-02T12:00:00Z'),
        },
        db,
      );
      expect(ranged.entries.map((e) => e.action)).toEqual(['project.restored']);

      // Pagination: total stays 3, page size 2.
      const page1 = await adminQueryAudit({ targetId: target, limit: 2, offset: 0 }, db);
      expect(page1.total).toBe(3);
      expect(page1.entries).toHaveLength(2);
      const page2 = await adminQueryAudit({ targetId: target, limit: 2, offset: 2 }, db);
      expect(page2.entries).toHaveLength(1);
    });
  });
});
