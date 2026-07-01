// Persistence tests for the platform key service. Real Postgres (tier-3 rule:
// no DB mocks), gated behind RUN_DB_TESTS=1. Run locally with:
//   pnpm db:up
//   RUN_DB_TESTS=1 TEST_DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5433/praxis \
//     pnpm exec vitest run --root ../.. apps/web/lib/platform-keys.integration

import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { _resetKeyCacheForTests } from '@praxis/crypto';
import { platformApiKeys, users } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';

import {
  NoPlatformKeyError,
  deactivateActivePlatformKey,
  getActivePlatformKey,
  setActivePlatformKey,
  tryGetActivePlatformKey,
} from './platform-keys';

// 32 fixed bytes, base64 — a real key shape for @praxis/crypto.
const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('platform-keys (real DB)', () => {
  let userId: string;

  beforeAll(async () => {
    process.env.PRAXIS_MASTER_KEY = TEST_KEY;
    _resetKeyCacheForTests();
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      const [u] = await db
        .insert(users)
        .values({ email: `pk-test-${randomUUID()}@example.com` })
        .returning({ id: users.id });
      userId = u!.id;
    });
  });

  afterAll(async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await db.delete(users).where(eq(users.id, userId));
    });
  });

  it('set → getActivePlatformKey round-trips the raw key (stored encrypted)', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-test-AAAA', userId, 'anthropic', db);

      const [row] = await db.select().from(platformApiKeys).where(eq(platformApiKeys.active, true));
      expect(row!.keyEncrypted).not.toBe('sk-ant-test-AAAA'); // ciphertext, not raw
      expect(row!.provider).toBe('anthropic');
      expect(await getActivePlatformKey('anthropic', db)).toBe('sk-ant-test-AAAA');
    });
  });

  it('rotation activates the new key and retains the prior one inactive', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-old-AAAA', userId, 'anthropic', db);
      await setActivePlatformKey('sk-ant-new-BBBB', userId, 'anthropic', db);

      expect(await getActivePlatformKey('anthropic', db)).toBe('sk-ant-new-BBBB');
      const rows = await db.select().from(platformApiKeys);
      expect(rows.length).toBe(2); // old retained for audit
      expect(rows.filter((r) => r.active).length).toBe(1); // exactly one active
    });
  });

  it('getActivePlatformKey throws NoPlatformKeyError when none is set', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await expect(getActivePlatformKey('anthropic', db)).rejects.toBeInstanceOf(
        NoPlatformKeyError,
      );
    });
  });

  it('keeps providers isolated — anthropic and openai active simultaneously', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-aaaa-AAAA', userId, 'anthropic', db);
      await setActivePlatformKey('sk-openai-bbbb-BBBB', userId, 'openai', db);

      expect(await getActivePlatformKey('anthropic', db)).toBe('sk-ant-aaaa-AAAA');
      expect(await getActivePlatformKey('openai', db)).toBe('sk-openai-bbbb-BBBB');
      const active = await db
        .select()
        .from(platformApiKeys)
        .where(eq(platformApiKeys.active, true));
      expect(active.length).toBe(2); // one active per provider
    });
  });

  it('rotation is scoped per provider (rotating openai leaves anthropic active)', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-keep-AAAA', userId, 'anthropic', db);
      await setActivePlatformKey('sk-openai-old-AAAA', userId, 'openai', db);
      await setActivePlatformKey('sk-openai-new-BBBB', userId, 'openai', db);

      expect(await getActivePlatformKey('anthropic', db)).toBe('sk-ant-keep-AAAA');
      expect(await getActivePlatformKey('openai', db)).toBe('sk-openai-new-BBBB');
      const active = await db
        .select()
        .from(platformApiKeys)
        .where(eq(platformApiKeys.active, true));
      expect(active.length).toBe(2); // exactly one active per provider
    });
  });

  it('the partial unique index rejects a second active key for the same provider', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-first-AAAA', userId, 'anthropic', db);
      // A raw insert bypassing the service must violate one-active-per-provider.
      await expect(
        db.insert(platformApiKeys).values({
          keyEncrypted: 'whatever',
          provider: 'anthropic',
          active: true,
          createdBy: userId,
        }),
      ).rejects.toThrow();
    });
  });

  it('tryGetActivePlatformKey returns null when the provider has no active key', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-only-AAAA', userId, 'anthropic', db);
      expect(await tryGetActivePlatformKey('openai', db)).toBeNull();
      expect(await tryGetActivePlatformKey('anthropic', db)).toBe('sk-ant-only-AAAA');
    });
  });

  it('deactivateActivePlatformKey clears one provider without touching the other', async () => {
    await withDb(async (db) => {
      await db.delete(platformApiKeys);
      await setActivePlatformKey('sk-ant-stay-AAAA', userId, 'anthropic', db);
      await setActivePlatformKey('sk-openai-gone-AAAA', userId, 'openai', db);

      await deactivateActivePlatformKey('openai', db);

      expect(await tryGetActivePlatformKey('openai', db)).toBeNull();
      expect(await getActivePlatformKey('anthropic', db)).toBe('sk-ant-stay-AAAA');
      const openaiRows = await db
        .select()
        .from(platformApiKeys)
        .where(eq(platformApiKeys.provider, 'openai'));
      expect(openaiRows.length).toBe(1); // row retained for audit, just inactive
      expect(openaiRows[0]!.active).toBe(false);
    });
  });
});
