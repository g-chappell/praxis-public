// Persistence tests for project rename / re-describe (STORY-39). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/projects.integration

import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { projects, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { eq } from 'drizzle-orm';

import {
  duplicateProjectRow,
  isProjectArchived,
  listUserProjects,
  resolveCreateTeam,
  setProjectArchived,
  setProjectBudget,
  updateProject,
} from './projects';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('setProjectBudget (real DB)', () => {
  it('owner sets the budget; a non-owner cannot', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      expect(await setProjectBudget(owner, projectId, '42.50', db)).toBe(true);
      const [row] = await db
        .select({ budgetUsd: projects.budgetUsd })
        .from(projects)
        .where(eq(projects.id, projectId));
      expect(row!.budgetUsd).toBe('42.50');

      const stranger = await seedUser(db);
      expect(await setProjectBudget(stranger, projectId, '1.00', db)).toBe(false);
    });
  });
});

async function seedUser(db: TestDb): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `proj-${randomUUID()}@example.test` })
    .returning({ id: users.id });
  return u!.id;
}

/** A team owned by `ownerId` with one project; returns ids for assertions. */
async function seedTeamWithProject(db: TestDb, ownerId: string) {
  const [team] = await db
    .insert(teams)
    .values({ name: 'T', createdBy: ownerId })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: ownerId });
  const [project] = await db
    .insert(projects)
    .values({ teamId: team!.id, name: 'P', templateId: 'react-threejs-scene', createdBy: ownerId })
    .returning({ id: projects.id, createdAt: projects.createdAt });
  return { teamId: team!.id, projectId: project!.id, createdAt: project!.createdAt };
}

describeDb('updateProject (real DB)', () => {
  it('owner renames and re-describes; trims and preserves createdAt', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId, createdAt } = await seedTeamWithProject(db, owner);

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
      const { projectId } = await seedTeamWithProject(db, owner);

      await updateProject(owner, projectId, { description: 'temp' }, db);
      const cleared = await updateProject(owner, projectId, { description: '   ' }, db);

      expect(cleared).not.toBeNull();
      expect(cleared!.description).toBeNull();
    });
  });

  it('a non-member cannot update the project (returns null, no write)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

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
      const { projectId } = await seedTeamWithProject(db, owner);

      const result = await updateProject(owner, projectId, {}, db);
      expect(result).toBeNull();
    });
  });
});

describeDb('setProjectArchived + listUserProjects status filter (real DB)', () => {
  it('archive hides from the default (active) list; archived list shows it; restore reverses', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

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

  it('a non-member cannot archive (returns false, no change)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      expect(await setProjectArchived(stranger, projectId, true, db)).toBe(false);
      const active = await listUserProjects(owner, { status: 'active' }, db);
      expect(active.map((p) => p.id)).toContain(projectId);
    });
  });

  it('isProjectArchived tracks archived_at (STORY-52)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

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
      const { teamId } = await seedTeamWithProject(db, owner);
      // Drop the seeded 'P' so only our three controlled rows remain.
      await db.delete(projects).where(eq(projects.teamId, teamId));

      // Insert with explicit, distinct createdAt so ordering is deterministic.
      const rows = [
        { name: 'Banana', createdAt: new Date('2026-01-02T00:00:00Z') },
        { name: 'Apple', createdAt: new Date('2026-01-03T00:00:00Z') },
        { name: 'Cherry', createdAt: new Date('2026-01-01T00:00:00Z') },
      ];
      for (const r of rows) {
        await db
          .insert(projects)
          .values({ teamId, templateId: 'react-threejs-scene', createdBy: owner, ...r });
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
  it('creates a "Copy of <name>" row in the same team with the same template', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      const copy = await duplicateProjectRow(owner, projectId, db);
      expect(copy).not.toBeNull();
      expect(copy!.id).not.toBe(projectId);
      expect(copy!.templateId).toBe('react-threejs-scene');

      // Both the source and the copy are in the owner's list, same team.
      const all = await listUserProjects(owner, { status: 'all' }, db);
      const names = all.map((p) => p.name);
      expect(names).toContain('P');
      expect(names).toContain('Copy of P');
    });
  });

  it('returns null for a non-member (no row created)', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const stranger = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);

      expect(await duplicateProjectRow(stranger, projectId, db)).toBeNull();
      const ownerProjects = await listUserProjects(owner, { status: 'all' }, db);
      expect(ownerProjects).toHaveLength(1);
    });
  });
});

describeDb('resolveCreateTeam + listUserProjects team label (STORY-57, real DB)', () => {
  it('resolveCreateTeam: member teamId ok; stranger forbidden; missing → most-recent; none → needs_team', async () => {
    await withDb(async (db) => {
      const user = await seedUser(db);
      expect(await resolveCreateTeam(user, undefined, db)).toEqual({ error: 'needs_team' });

      const [a] = await db
        .insert(teams)
        .values({ name: 'A', createdBy: user })
        .returning({ id: teams.id });
      await db.insert(teamMemberships).values({ teamId: a!.id, userId: user });
      const [b] = await db
        .insert(teams)
        .values({ name: 'B', createdBy: user })
        .returning({ id: teams.id });
      await db.insert(teamMemberships).values({ teamId: b!.id, userId: user });

      // Explicit team the user belongs to → that team.
      expect(await resolveCreateTeam(user, a!.id, db)).toEqual({ teamId: a!.id });
      // A team the user doesn't belong to → forbidden.
      const stranger = await seedUser(db);
      const [c] = await db
        .insert(teams)
        .values({ name: 'C', createdBy: stranger })
        .returning({ id: teams.id });
      await db.insert(teamMemberships).values({ teamId: c!.id, userId: stranger });
      expect(await resolveCreateTeam(user, c!.id, db)).toEqual({ error: 'forbidden' });
      // No teamId → the most-recent team (B was created last).
      expect(await resolveCreateTeam(user, undefined, db)).toEqual({ teamId: b!.id });
    });
  });

  it('listUserProjects labels each project with its team name', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { projectId } = await seedTeamWithProject(db, owner);
      const list = await listUserProjects(owner, { status: 'all' }, db);
      expect(list.find((p) => p.id === projectId)!.teamName).toBe('T');
    });
  });
});
