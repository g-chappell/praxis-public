// Admin email/domain blocklist CRUD (STORY-46). Admin-scoped — gate on
// isUserAdmin at the route. The sign-in gate (lib/blocklist.ts) reads these
// entries; this is the management side.

import { desc, eq } from 'drizzle-orm';

import { emailBlocklist } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

export interface BlocklistEntry {
  id: string;
  value: string;
  isDomain: boolean;
  reason: string | null;
  addedBy: string | null;
  createdAt: Date | null;
}

/** Normalize a blocklist value: trimmed + lowercased. */
export function normalizeBlocklistValue(value: string): string {
  return value.trim().toLowerCase();
}

export async function listBlocklist(database: Database = db): Promise<BlocklistEntry[]> {
  return database
    .select({
      id: emailBlocklist.id,
      value: emailBlocklist.value,
      isDomain: emailBlocklist.isDomain,
      reason: emailBlocklist.reason,
      addedBy: emailBlocklist.addedBy,
      createdAt: emailBlocklist.createdAt,
    })
    .from(emailBlocklist)
    .orderBy(desc(emailBlocklist.createdAt));
}

/** Add an entry. Returns the created row, or null when `value` is already
 *  blocklisted (unique conflict — idempotent, no duplicate). */
export async function addBlocklistEntry(
  input: { value: string; isDomain: boolean; reason: string | null; addedBy: string },
  database: Database = db,
): Promise<BlocklistEntry | null> {
  const [row] = await database
    .insert(emailBlocklist)
    .values({
      value: normalizeBlocklistValue(input.value),
      isDomain: input.isDomain,
      reason: input.reason,
      addedBy: input.addedBy,
    })
    .onConflictDoNothing({ target: emailBlocklist.value })
    .returning({
      id: emailBlocklist.id,
      value: emailBlocklist.value,
      isDomain: emailBlocklist.isDomain,
      reason: emailBlocklist.reason,
      addedBy: emailBlocklist.addedBy,
      createdAt: emailBlocklist.createdAt,
    });
  return row ?? null;
}

/** Remove an entry by id. Returns its value (for the audit row), or null when
 *  no such entry exists. */
export async function removeBlocklistEntry(
  id: string,
  database: Database = db,
): Promise<{ value: string } | null> {
  const [row] = await database
    .delete(emailBlocklist)
    .where(eq(emailBlocklist.id, id))
    .returning({ value: emailBlocklist.value });
  return row ?? null;
}
