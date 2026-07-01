// Persistence tests for team invite mint/accept (STORY-31/56). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/invites.integration

import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { projects, teamInvites, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { acceptInvite, createTeamInvite } from './invites';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `invite-${randomUUID()}@example.test` })
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
    .returning({ id: projects.id });
  return { teamId: team!.id, projectId: project!.id };
}

async function memberCount(db: TestDb, teamId: string, userId: string): Promise<number> {
  const rows = await db
    .select({ userId: teamMemberships.userId })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)));
  return rows.length;
}

/** Insert a fresh, valid invite code directly — decouples the acceptInvite tests
 *  from the mint path (which is covered by the createTeamInvite test). */
async function mintCode(db: TestDb, teamId: string): Promise<string> {
  const code = randomBytesCode();
  await db
    .insert(teamInvites)
    .values({ teamId, inviteCode: code, expiresAt: new Date(Date.now() + 86_400_000) });
  return code;
}

describeDb('invites (real DB)', () => {
  it('acceptInvite: a non-member joins exactly once and lands on the team project', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const joiner = await seedUser(db);
      const { teamId, projectId } = await seedTeamWithProject(db, owner);
      const code = await mintCode(db, teamId);

      const r = await acceptInvite(joiner, code, { db });
      expect(r).toEqual({ status: 'ok', teamId, projectId, alreadyMember: false });
      expect(await memberCount(db, teamId, joiner)).toBe(1);

      // Code is now consumed (acceptedBy stamped).
      const [inv] = await db.select().from(teamInvites).where(eq(teamInvites.inviteCode, code));
      expect(inv!.acceptedBy).toBe(joiner);
    });
  });

  it('acceptInvite: an existing member is a no-op that does NOT consume the code', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { teamId, projectId } = await seedTeamWithProject(db, owner);
      const code = await mintCode(db, teamId);

      const r = await acceptInvite(owner, code, { db });
      expect(r).toMatchObject({ status: 'ok', alreadyMember: true, teamId, projectId });
      expect(await memberCount(db, teamId, owner)).toBe(1); // no duplicate

      const [inv] = await db.select().from(teamInvites).where(eq(teamInvites.inviteCode, code));
      expect(inv!.acceptedBy).toBeNull(); // not consumed — still usable by a real invitee
    });
  });

  it('acceptInvite: a full team (cap 2) refuses a 3rd joiner without consuming the invite', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const partner = await seedUser(db);
      const third = await seedUser(db);
      const { teamId } = await seedTeamWithProject(db, owner);
      // Fill the team to the cap of 2 (owner + partner).
      await db.insert(teamMemberships).values({ teamId, userId: partner });

      const code = await mintCode(db, teamId);
      expect(await acceptInvite(third, code, { db })).toEqual({ status: 'team_full' });
      expect(await memberCount(db, teamId, third)).toBe(0);

      // The invite is left unconsumed so the owner can still reconcile.
      const [inv] = await db.select().from(teamInvites).where(eq(teamInvites.inviteCode, code));
      expect(inv!.acceptedBy).toBeNull();

      // An existing member re-opening the link on a full team still no-ops ok.
      expect(await acceptInvite(owner, code, { db })).toMatchObject({
        status: 'ok',
        alreadyMember: true,
      });
    });
  });

  it('acceptInvite: invalid / expired / used all reject with no membership change', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const a = await seedUser(db);
      const b = await seedUser(db);
      const { teamId } = await seedTeamWithProject(db, owner);

      expect(await acceptInvite(a, 'no-such-code', { db })).toEqual({ status: 'invalid' });

      // Expired.
      const expired = randomBytesCode();
      await db.insert(teamInvites).values({
        teamId,
        inviteCode: expired,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await acceptInvite(a, expired, { db })).toEqual({ status: 'expired' });
      expect(await memberCount(db, teamId, a)).toBe(0);

      // Used: first acceptor wins, a second different user is rejected.
      const code = await mintCode(db, teamId);
      await acceptInvite(a, code, { db });
      expect(await acceptInvite(b, code, { db })).toEqual({ status: 'used' });
      expect(await memberCount(db, teamId, b)).toBe(0);
    });
  });

  it('createTeamInvite: owner mints; non-owner 403; full team team_full; unknown 404', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const { teamId } = await seedTeamWithProject(db, owner);

      const minted = await createTeamInvite(owner, teamId, { db });
      expect('invite' in minted).toBe(true);
      if ('invite' in minted) {
        expect(minted.invite.code).toMatch(/^[A-Za-z0-9_-]{16,}$/);
        const [row] = await db
          .select()
          .from(teamInvites)
          .where(eq(teamInvites.inviteCode, minted.invite.code));
        expect(row!.teamId).toBe(teamId);
      }

      const stranger = await seedUser(db);
      expect(await createTeamInvite(stranger, teamId, { db })).toEqual({ error: 'not_owner' });
      expect(await createTeamInvite(owner, randomUUID(), { db })).toEqual({ error: 'not_found' });

      // Fill the team to the cap → minting is refused.
      const partner = await seedUser(db);
      await db.insert(teamMemberships).values({ teamId, userId: partner });
      expect(await createTeamInvite(owner, teamId, { db })).toEqual({ error: 'team_full' });
    });
  });
});

function randomBytesCode(): string {
  return randomUUID().replace(/-/g, '');
}
