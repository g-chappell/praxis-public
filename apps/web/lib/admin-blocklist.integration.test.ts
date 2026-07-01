// Persistence tests for the admin blocklist CRUD (STORY-46). Real Postgres
// (tier-3), gated behind RUN_DB_TESTS=1.

import { randomUUID } from 'node:crypto';

import { users } from '@praxis/db';
import { dbTestsEnabled, withDb } from '@praxis/db/test';
import { describe, expect, it } from 'vitest';

import { addBlocklistEntry, listBlocklist, removeBlocklistEntry } from './admin-blocklist';

const describeDb = dbTestsEnabled() ? describe : describe.skip;

describeDb('admin blocklist CRUD (real DB)', () => {
  it('adds, lists, and removes an entry; dedupes on conflict', async () => {
    await withDb(async (db) => {
      const [admin] = await db
        .insert(users)
        .values({ email: `bl-admin-${randomUUID()}@example.test`, role: 'admin' })
        .returning({ id: users.id });

      const value = `Spam-${randomUUID().slice(0, 8)}@evil.test`;
      const entry = await addBlocklistEntry(
        { value, isDomain: false, reason: 'abuse', addedBy: admin!.id },
        db,
      );
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe(value.toLowerCase()); // normalized

      // Appears in the list.
      expect((await listBlocklist(db)).map((e) => e.id)).toContain(entry!.id);

      // Duplicate (case-insensitive) → null, no second row.
      const dupe = await addBlocklistEntry(
        { value: value.toUpperCase(), isDomain: false, reason: null, addedBy: admin!.id },
        db,
      );
      expect(dupe).toBeNull();

      // Remove returns the value (for the audit row), then it's gone.
      const removed = await removeBlocklistEntry(entry!.id, db);
      expect(removed?.value).toBe(value.toLowerCase());
      expect((await listBlocklist(db)).map((e) => e.id)).not.toContain(entry!.id);
      expect(await removeBlocklistEntry(randomUUID(), db)).toBeNull(); // missing
    });
  });
});
