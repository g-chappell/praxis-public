// Persistence tests for team create / get / rename (STORY-54/55). Real Postgres
// (tier-3: no DB mocks), gated behind RUN_DB_TESTS=1 so CI without a database
// still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/teams.integration

import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { auditLog, teamMemberships, teams, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';

import { createTeam, getTeamsForUser, leaveTeam, removeMember, renameTeam } from './teams';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb, displayName?: string): Promise<string> {
  const [u] = await db
    .insert(users)
    .values({ email: `team-${randomUUID()}@example.test`, displayName: displayName ?? null })
    .returning({ id: users.id });
  return u!.id;
}

describeDb('createTeam (real DB)', () => {
  it('creates a team with the creator as owner member', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db, 'Ada');
      const result = await createTeam(owner, '  Acme  ', db);
      expect('team' in result).toBe(true);
      if (!('team' in result)) return;

      expect(result.team.name).toBe('Acme');
      expect(result.team.isOwner).toBe(true);
      expect(result.team.members).toHaveLength(1);
      expect(result.team.members[0]).toMatchObject({
        userId: owner,
        displayName: 'Ada',
        isOwner: true,
      });
      expect(result.team.members[0]!.joinedAt).toBeInstanceOf(Date);
    });
  });

  it('lets a user create multiple teams — no one-team-per-user guard', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const first = await createTeam(owner, 'First', db);
      const second = await createTeam(owner, 'Second', db);
      expect('team' in first && 'team' in second).toBe(true);
      const teams = await getTeamsForUser(owner, db);
      expect(teams.map((t) => t.name).sort()).toEqual(['First', 'Second']);
      expect(teams.every((t) => t.isOwner)).toBe(true);
    });
  });

  it('rejects an empty or too-long name without inserting', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      expect(await createTeam(owner, '   ', db)).toEqual({ error: 'invalid_name' });
      expect(await createTeam(owner, 'a'.repeat(61), db)).toEqual({ error: 'invalid_name' });
      expect(await getTeamsForUser(owner, db)).toHaveLength(0);
    });
  });
});

describeDb('getTeamsForUser (real DB)', () => {
  it('returns [] when the user is in no team', async () => {
    await withDb(async (db) => {
      const user = await seedUser(db);
      expect(await getTeamsForUser(user, db)).toEqual([]);
    });
  });

  it('returns every owned + member team, newest first, with per-viewer isOwner', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db, 'Owner');
      const a = await createTeam(owner, 'Alpha', db);
      const b = await createTeam(owner, 'Beta', db);
      if (!('team' in a) || !('team' in b)) throw new Error('expected teams');

      // A partner joins Beta; the owner also belongs to a third team they don't own.
      const partner = await seedUser(db, 'Partner');
      await db.insert(teamMemberships).values({ teamId: b.team.id, userId: partner });
      const other = await seedUser(db);
      const c = await createTeam(other, 'Gamma', db);
      if (!('team' in c)) throw new Error('expected team');
      await db.insert(teamMemberships).values({ teamId: c.team.id, userId: owner });

      const ownerTeams = await getTeamsForUser(owner, db);
      // Assert by set + ownership (createdAt defaults can tie within one tx, so
      // exact newest-first order isn't deterministic here).
      expect(ownerTeams.map((t) => t.name).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
      expect(ownerTeams.find((t) => t.name === 'Beta')!.isOwner).toBe(true);
      expect(ownerTeams.find((t) => t.name === 'Gamma')!.isOwner).toBe(false);
      expect(ownerTeams.find((t) => t.name === 'Beta')!.members.map((m) => m.userId)).toEqual([
        owner,
        partner,
      ]);

      // The partner only sees Beta, as a non-owner; an unrelated team is excluded.
      const partnerTeams = await getTeamsForUser(partner, db);
      expect(partnerTeams.map((t) => t.name)).toEqual(['Beta']);
      expect(partnerTeams[0]!.isOwner).toBe(false);
    });
  });
});

describeDb('renameTeam (real DB)', () => {
  it('owner renames; persists and writes a team.renamed audit row', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      const result = await renameTeam(owner, created.team.id, '  Acme Labs  ', db);
      expect('team' in result && result.team.name).toBe('Acme Labs');

      const [row] = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, created.team.id));
      expect(row!.name).toBe('Acme Labs');

      const audits = await db
        .select({ action: auditLog.action, targetId: auditLog.targetId })
        .from(auditLog)
        .where(eq(auditLog.targetId, created.team.id));
      expect(audits).toContainEqual({ action: 'team.renamed', targetId: created.team.id });
    });
  });

  it('returns not_owner for a non-owner and does not change the name', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      const stranger = await seedUser(db);
      expect(await renameTeam(stranger, created.team.id, 'Hijacked', db)).toEqual({
        error: 'not_owner',
      });
      const [row] = await db
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, created.team.id));
      expect(row!.name).toBe('Acme');
    });
  });

  it('rejects an empty or too-long name and reports a missing team', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');

      expect(await renameTeam(owner, created.team.id, '   ', db)).toEqual({
        error: 'invalid_name',
      });
      expect(await renameTeam(owner, created.team.id, 'a'.repeat(61), db)).toEqual({
        error: 'invalid_name',
      });
      expect(await renameTeam(owner, randomUUID(), 'Ghost', db)).toEqual({ error: 'not_found' });
    });
  });
});

async function teamMemberIds(db: TestDb, teamId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: teamMemberships.userId })
    .from(teamMemberships)
    .where(eq(teamMemberships.teamId, teamId));
  return rows.map((r) => r.userId).sort();
}

describeDb('removeMember (real DB)', () => {
  it('owner removes the partner; audits team.member_removed; idempotent', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');
      const partner = await seedUser(db);
      await db.insert(teamMemberships).values({ teamId: created.team.id, userId: partner });

      expect(await removeMember(owner, created.team.id, partner, db)).toEqual({ ok: true });
      expect(await teamMemberIds(db, created.team.id)).toEqual([owner]);

      const audits = await db
        .select({ action: auditLog.action, targetId: auditLog.targetId })
        .from(auditLog)
        .where(eq(auditLog.targetId, created.team.id));
      expect(audits).toContainEqual({ action: 'team.member_removed', targetId: created.team.id });

      // Idempotent: removing again is still ok and writes no second audit row.
      expect(await removeMember(owner, created.team.id, partner, db)).toEqual({ ok: true });
      const after = await db
        .select({ action: auditLog.action })
        .from(auditLog)
        .where(
          and(eq(auditLog.targetId, created.team.id), eq(auditLog.action, 'team.member_removed')),
        );
      expect(after).toHaveLength(1);
    });
  });

  it('403s a non-owner and refuses removing the owner', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');
      const partner = await seedUser(db);
      await db.insert(teamMemberships).values({ teamId: created.team.id, userId: partner });

      expect(await removeMember(partner, created.team.id, owner, db)).toEqual({
        error: 'not_owner',
      });
      expect(await removeMember(owner, created.team.id, owner, db)).toEqual({
        error: 'cannot_remove_owner',
      });
      expect(await removeMember(owner, randomUUID(), partner, db)).toEqual({ error: 'not_found' });
      // Nothing was removed by the refused calls.
      expect(await teamMemberIds(db, created.team.id)).toEqual([owner, partner].sort());
    });
  });
});

describeDb('leaveTeam (real DB)', () => {
  it('a non-owner leaves; audits team.member_left; the owner cannot leave', async () => {
    await withDb(async (db) => {
      const owner = await seedUser(db);
      const created = await createTeam(owner, 'Acme', db);
      if (!('team' in created)) throw new Error('expected team');
      const partner = await seedUser(db);
      await db.insert(teamMemberships).values({ teamId: created.team.id, userId: partner });

      expect(await leaveTeam(owner, created.team.id, db)).toEqual({ error: 'owner_cannot_leave' });
      expect(await leaveTeam(partner, created.team.id, db)).toEqual({ ok: true });
      expect(await teamMemberIds(db, created.team.id)).toEqual([owner]);

      const audits = await db
        .select({ action: auditLog.action, targetId: auditLog.targetId })
        .from(auditLog)
        .where(eq(auditLog.targetId, created.team.id));
      expect(audits).toContainEqual({ action: 'team.member_left', targetId: created.team.id });

      expect(await leaveTeam(partner, randomUUID(), db)).toEqual({ error: 'not_found' });
    });
  });
});
