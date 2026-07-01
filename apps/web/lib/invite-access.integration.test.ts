// Terminal verify for STORY-31 (TASK-084): the loop the feature exists to close.
// A second user has NO access to a project until they redeem an invite; after
// acceptInvite they pass userOwnsProject (the gate the workspace page enforces)
// and the accept route's landing target resolves to the shared project. Real
// Postgres (RUN_DB_TESTS=1, dev DB :5433). The "both users in the presence list"
// step is multiplayer/live — verified on the VPS post-deploy.

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { projects, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { acceptInvite, createTeamInvite } from './invites';
import { userOwnsProject } from './projects';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `acc-${randomUUID()}@example.test` })
    .returning({ id: users.id });
  return u!.id;
}

describeDb('invite access loop (real DB)', () => {
  it('redeeming an invite grants project access and resolves the landing project', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const joiner = await seedUser(db);
      const [team] = await db
        .insert(teams)
        .values({ name: 'T', createdBy: owner })
        .returning({ id: teams.id });
      await db.insert(teamMemberships).values({ teamId: team!.id, userId: owner });
      const [project] = await db
        .insert(projects)
        .values({
          teamId: team!.id,
          name: 'P',
          templateId: 'react-threejs-scene',
          createdBy: owner,
        })
        .returning({ id: projects.id });
      const projectId = project!.id;

      // Before: the joiner cannot open the project (the workspace page would redirect).
      expect(await userOwnsProject(joiner, projectId, db)).toBe(false);

      const minted = await createTeamInvite(owner, team!.id, { db });
      if (!('invite' in minted)) throw new Error('expected invite');
      const result = await acceptInvite(joiner, minted.invite.code, { db });

      // The accept route redirects to result.projectId — assert it's the shared one.
      expect(result).toEqual({ status: 'ok', teamId: team!.id, projectId, alreadyMember: false });

      // After: access is granted — the workspace page now loads for the joiner.
      expect(await userOwnsProject(joiner, projectId, db)).toBe(true);
    });
  });

  it('a used link leaves a third user without access', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const first = await seedUser(db);
      const third = await seedUser(db);
      const [team] = await db
        .insert(teams)
        .values({ name: 'T', createdBy: owner })
        .returning({ id: teams.id });
      await db.insert(teamMemberships).values({ teamId: team!.id, userId: owner });
      const [project] = await db
        .insert(projects)
        .values({
          teamId: team!.id,
          name: 'P',
          templateId: 'react-threejs-scene',
          createdBy: owner,
        })
        .returning({ id: projects.id });

      const minted = await createTeamInvite(owner, team!.id, { db });
      if (!('invite' in minted)) throw new Error('expected invite');
      const code = minted.invite.code;
      await acceptInvite(first, code, { db });
      expect(await acceptInvite(third, code, { db })).toEqual({ status: 'used' });
      expect(await userOwnsProject(third, project!.id, db)).toBe(false);

      // Cleanup is implicit (withDb pool is short-lived); guard against orphan ref.
      await db.delete(projects).where(eq(projects.id, project!.id));
    });
  });
});
