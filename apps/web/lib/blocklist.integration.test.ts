// Persistence tests for the sign-in gate (STORY-46). Real Postgres (tier-3),
// gated behind RUN_DB_TESTS=1. Run locally with:
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/blocklist.integration

import { randomUUID } from 'node:crypto';

import { authSession, emailBlocklist, users } from '@praxis/db';
import { type TestDb, dbTestsEnabled, withDb } from '@praxis/db/test';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { revokeUserSessions, signInBlockReason } from './blocklist';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

async function seedUser(db: TestDb, opts: { banned?: boolean } = {}): Promise<string> {
  const email = `gate-${randomUUID()}@example.test`;
  await db.insert(users).values({ email, bannedAt: opts.banned ? new Date() : null });
  return email;
}

describeDb('signInBlockReason (real DB)', () => {
  it('allows an ordinary, non-blocked email', async () => {
    await withDb(async (db) => {
      const email = await seedUser(db);
      expect(await signInBlockReason(email, db)).toBeNull();
    });
  });

  it('blocks a banned user', async () => {
    await withDb(async (db) => {
      const email = await seedUser(db, { banned: true });
      expect(await signInBlockReason(email, db)).toBe('banned');
    });
  });

  it('blocks an exact-email blocklist entry (case-insensitive)', async () => {
    await withDb(async (db) => {
      const email = `Blocked-${randomUUID()}@example.test`;
      await db.insert(emailBlocklist).values({ value: email.toLowerCase(), isDomain: false });
      expect(await signInBlockReason(email, db)).toBe('blocklisted');
    });
  });

  it('blocks any address on a blocklisted domain', async () => {
    await withDb(async (db) => {
      const domain = `spam-${randomUUID().slice(0, 8)}.test`;
      await db.insert(emailBlocklist).values({ value: domain, isDomain: true });
      expect(await signInBlockReason(`anyone@${domain}`, db)).toBe('blocklisted');
      // A different domain is unaffected.
      expect(await signInBlockReason(`anyone@other-${domain}`, db)).toBeNull();
    });
  });
});

describeDb('revokeUserSessions (real DB)', () => {
  it('deletes all of a user’s sessions', async () => {
    await withDb(async (db) => {
      const email = `revoke-${randomUUID()}@example.test`;
      const [u] = await db.insert(users).values({ email }).returning({ id: users.id });
      await db.insert(authSession).values({
        userId: u!.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      });
      await revokeUserSessions(u!.id, db);
      const left = await db.select().from(authSession).where(eq(authSession.userId, u!.id));
      expect(left).toHaveLength(0);
    });
  });
});
