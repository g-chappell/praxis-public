// Persistence tests for project rename / re-describe / archive / duplicate. Real
// Postgres (no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. A project is owned by its creator (createdBy) — there are no
// teams. Run locally with:
//   docker compose up -d db
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5432/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/projects.integration

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { projects, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import {
  duplicateProjectRow,
  isProjectArchived,
  listUserProjects,
  setProjectArchived,
  updateProject,
} from './projects';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `proj-${randomUUID()}@example.test` })
    .returning({ id: users.id });
  return u!.id;
}

/** One project owned by `ownerId`; returns ids for assertions. */
async function seedProject(db: TestDb, ownerId: string) {
  const [project] = await db
    .insert(projects)
    .values({ name: 'P', templateId: 'react-threejs-scene', createdBy: ownerId })
    .returning({ id: projects.id, createdAt: projects.createdAt });
  return { projectId: project!.id, createdAt: project!.createdAt };
}

describeDb('updateProject (real DB)', () => {
  it('owner renames and re-describes; trims and preserves createdAt', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId, createdAt } = await seedProject(db, owner);

      const updated = await updateProject(
        owner,
        projectId,
        { name: '  Renamed  ', description: '  a scene  ' },
        db,
      );

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Renamed');
      expect(updated!.description).toBe('a scene');
      // createdAt is immutable across an update.
      expect(updated!.createdAt?.getTime()).toBe(createdAt?.getTime());
    });
  });

  it('an empty description clears it to null', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      await updateProject(owner, projectId, { description: 'temp' }, db);
      const cleared = await updateProject(owner, projectId, { description: '   ' }, db);

      expect(cleared).not.toBeNull();
      expect(cleared!.description).toBeNull();
    });
  });

  it('a non-owner cannot update the project (returns null, no write)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      const result = await updateProject(stranger, projectId, { name: 'Hijacked' }, db);
      expect(result).toBeNull();

      // The original name is untouched.
      const after = await updateProject(owner, projectId, { name: 'P' }, db);
      expect(after!.name).toBe('P');
    });
  });

  it('an empty field set is a no-op (returns null)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      const result = await updateProject(owner, projectId, {}, db);
      expect(result).toBeNull();
    });
  });
});

describeDb('setProjectArchived + listUserProjects status filter (real DB)', () => {
  it('archive hides from the default (active) list; archived list shows it; restore reverses', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      // Active by default.
      let active = await listUserProjects(owner, {}, db);
      expect(active.map((p) => p.id)).toContain(projectId);

      // Archive → drops from active, appears in archived.
      expect(await setProjectArchived(owner, projectId, true, db)).toBe(true);
      active = await listUserProjects(owner, { status: 'active' }, db);
      expect(active.map((p) => p.id)).not.toContain(projectId);
      const archived = await listUserProjects(owner, { status: 'archived' }, db);
      expect(archived.map((p) => p.id)).toContain(projectId);
      expect(archived.find((p) => p.id === projectId)!.archivedAt).toBeInstanceOf(Date);

      // 'all' includes it regardless.
      const all = await listUserProjects(owner, { status: 'all' }, db);
      expect(all.map((p) => p.id)).toContain(projectId);

      // Restore → back in active, cleared.
      expect(await setProjectArchived(owner, projectId, false, db)).toBe(true);
      active = await listUserProjects(owner, { status: 'active' }, db);
      expect(active.map((p) => p.id)).toContain(projectId);
      expect(active.find((p) => p.id === projectId)!.archivedAt).toBeNull();
    });
  });

  it('a non-owner cannot archive (returns false, no change)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      expect(await setProjectArchived(stranger, projectId, true, db)).toBe(false);
      const active = await listUserProjects(owner, { status: 'active' }, db);
      expect(active.map((p) => p.id)).toContain(projectId);
    });
  });

  it('isProjectArchived tracks archived_at', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      expect(await isProjectArchived(projectId, db)).toBe(false);
      await setProjectArchived(owner, projectId, true, db);
      expect(await isProjectArchived(projectId, db)).toBe(true);
      await setProjectArchived(owner, projectId, false, db);
      expect(await isProjectArchived(projectId, db)).toBe(false);
      // A missing project reads as not-archived (ownership check 404s it upstream).
      expect(await isProjectArchived(randomUUID(), db)).toBe(false);
    });
  });
});

describeDb('listUserProjects sort order (real DB)', () => {
  it('orders by recent (default), oldest, and name', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);

      // Insert with explicit, distinct createdAt so ordering is deterministic.
      const rows = [
        { name: 'Banana', createdAt: new Date('2026-01-02T00:00:00Z') },
        { name: 'Apple', createdAt: new Date('2026-01-03T00:00:00Z') },
        { name: 'Cherry', createdAt: new Date('2026-01-01T00:00:00Z') },
      ];
      for (const r of rows) {
        await db
          .insert(projects)
          .values({ templateId: 'react-threejs-scene', createdBy: owner, ...r });
      }

      const recent = await listUserProjects(owner, { sort: 'recent' }, db);
      expect(recent.map((p) => p.name)).toEqual(['Apple', 'Banana', 'Cherry']);

      const oldest = await listUserProjects(owner, { sort: 'oldest' }, db);
      expect(oldest.map((p) => p.name)).toEqual(['Cherry', 'Banana', 'Apple']);

      const byName = await listUserProjects(owner, { sort: 'name' }, db);
      expect(byName.map((p) => p.name)).toEqual(['Apple', 'Banana', 'Cherry']);
    });
  });
});

describeDb('duplicateProjectRow (real DB)', () => {
  it('creates a "Copy of <name>" row with the same template', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      const copy = await duplicateProjectRow(owner, projectId, db);
      expect(copy).not.toBeNull();
      expect(copy!.id).not.toBe(projectId);
      expect(copy!.templateId).toBe('react-threejs-scene');

      // Both the source and the copy are in the owner's list.
      const all = await listUserProjects(owner, { status: 'all' }, db);
      const names = all.map((p) => p.name);
      expect(names).toContain('P');
      expect(names).toContain('Copy of P');
    });
  });

  it('returns null for a non-owner (no row created)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedProject(db, owner);

      expect(await duplicateProjectRow(stranger, projectId, db)).toBeNull();
      const ownerProjects = await listUserProjects(owner, { status: 'all' }, db);
      expect(ownerProjects.map((p) => p.id)).toEqual([projectId]);
    });
  });
});
