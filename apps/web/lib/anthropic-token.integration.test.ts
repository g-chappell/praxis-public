// Persistence test for the refresh-on-expiry path. Uses a real Postgres
// (tier-3 rule: no DB mocks) and is gated behind RUN_DB_TESTS=1 so CI without
// a database still passes. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/anthropic-token.integration

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { _resetKeyCacheForTests, decrypt, encrypt } from '@praxis/crypto';
import { oauthTokens, users } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';

import { PROVIDER } from './anthropic-oauth';
import { getValidAnthropicToken } from './anthropic-token';

// 32 fixed bytes, base64 — a real key shape for @praxis/crypto.
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('getValidAnthropicToken (real DB)', () => {
  beforeAll(() => {
    process.env.PRAXIS_MASTER_KEY = TEST_KEY;
    _resetKeyCacheForTests();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  async function seedUser(db: Parameters<Parameters<typeof withDb>[0]>[0]): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({ email: `oauth-test-${randomUUID()}@example.test` })
      .returning({ id: users.id });
    return user!.id;
  }

  it('refreshes when the access token is expired and persists the new tokens', async () => {
    await withDb(async (db) => {
      const userId = await seedUser(db);
      try {
        await db.insert(oauthTokens).values({
          userId,
          provider: PROVIDER,
          accessTokenEncrypted: await encrypt('stale-access'),
          refreshTokenEncrypted: await encrypt('refresh-1'),
          expiresAt: new Date(Date.now() - 60_000), // already expired
        });

        const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
          new Response(
            JSON.stringify({
              access_token: 'fresh-access',
              refresh_token: 'refresh-2',
              expires_in: 3600,
            }),
            { status: 200 },
          ),
        );

        const token = await getValidAnthropicToken(userId, { db });
        expect(token).toBe('fresh-access');
        expect(fetchMock).toHaveBeenCalledOnce();

        const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId));
        expect(await decrypt(row!.accessTokenEncrypted)).toBe('fresh-access');
        expect(await decrypt(row!.refreshTokenEncrypted!)).toBe('refresh-2');
        expect(row!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      } finally {
        await db.delete(users).where(eq(users.id, userId));
      }
    });
  });

  it('returns the stored token without refreshing when not near expiry', async () => {
    await withDb(async (db) => {
      const userId = await seedUser(db);
      try {
        await db.insert(oauthTokens).values({
          userId,
          provider: PROVIDER,
          accessTokenEncrypted: await encrypt('still-valid'),
          refreshTokenEncrypted: await encrypt('refresh-x'),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        });

        const fetchMock = vi.spyOn(global, 'fetch');
        const token = await getValidAnthropicToken(userId, { db });
        expect(token).toBe('still-valid');
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        await db.delete(users).where(eq(users.id, userId));
      }
    });
  });
});
