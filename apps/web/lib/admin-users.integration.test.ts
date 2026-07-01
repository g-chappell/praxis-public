// Persistence tests for the admin users directory (STORY-45). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1. Run locally with:
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/admin-users.integration

import { randomUUID } from 'node:crypto';

import { projects, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { adminGetUser, adminListUsers, adminSetUserRole, countAdmins } from './admin-users';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(
  db: TestDb,
  opts: { name?: string; role?: 'user' | 'admin' } = {},
): Promise<{ id: string; email: string }> {
  const email = `u-${randomUUID()}@example.test`;
  const [u] = await db
    .insert(users)
    .values({ email, displayName: opts.name, role: opts.role ?? 'user' })
    .returning({ id: users.id });
  return { id: u!.id, email };
}

async function seedProject(db: TestDb, ownerId: string, name: string): Promise<string> {
  const [team] = await db
    .insert(teams)
    .values({ name: `${name}-team`, createdBy: ownerId })
    .returning({ id: teams.id });
  await db.insert(teamMemberships).values({ teamId: team!.id, userId: ownerId });
  const [project] = await db
    .insert(projects)
    .values({ teamId: team!.id, name, templateId: 'react-threejs-scene', createdBy: ownerId })
    .returning({ id: projects.id });
  return project!.id;
}

describeDb('adminListUsers / adminGetUser (real DB)', () => {
  it('lists users with role, banned status, and project count; searches by email', async () => {
    await withDb(async (db) => {
      const ada = await seedUser(db, { name: 'Ada Lovelace' });
      await seedProject(db, ada.id, `p1-${ada.id.slice(0, 6)}`);
      await seedProject(db, ada.id, `p2-${ada.id.slice(0, 6)}`);

      const byEmail = await adminListUsers({ q: ada.email }, db);
      expect(byEmail).toHaveLength(1);
      expect(byEmail[0]!.id).toBe(ada.id);
      expect(byEmail[0]!.role).toBe('user');
      expect(byEmail[0]!.bannedAt).toBeNull();
      expect(byEmail[0]!.projectCount).toBe(2);

      // Name search also matches.
      expect((await adminListUsers({ q: 'Ada Lovelace' }, db)).map((r) => r.id)).toContain(ada.id);
    });
  });

  it('returns a user detail with their projects, sessions placeholder, and activity', async () => {
    await withDb(async (db) => {
      const user = await seedUser(db, { name: 'Grace' });
      const projectId = await seedProject(db, user.id, `detail-${user.id.slice(0, 6)}`);

      const detail = await adminGetUser(user.id, db);
      expect(detail).not.toBeNull();
      expect(detail!.email).toBe(user.email);
      expect(detail!.projects.map((p) => p.id)).toContain(projectId);
      expect(Array.isArray(detail!.recentSessions)).toBe(true);
      expect(Array.isArray(detail!.recentActivity)).toBe(true);
    });
  });

  it('returns null for a missing user', async () => {
    await withDb(async (db) => {
      expect(await adminGetUser(randomUUID(), db)).toBeNull();
    });
  });

  it('counts admins and sets a role by id', async () => {
    await withDb(async (db) => {
      const before = await countAdmins(db);
      const u = await seedUser(db, { role: 'user' });
      expect(await adminSetUserRole(u.id, 'admin', db)).toBe(true);
      expect(await countAdmins(db)).toBe(before + 1);
      const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, u.id));
      expect(row!.role).toBe('admin');
      expect(await adminSetUserRole(randomUUID(), 'admin', db)).toBe(false); // missing user
    });
  });
});
