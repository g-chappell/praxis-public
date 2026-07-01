// Admin authorization (EPIC-05). The admin role lives on users.role
// (packages/db); Better Auth's session doesn't carry it, so admin surfaces
// look it up server-side. The pure `adminAccess` decision is split out so the
// guard is unit-testable without a DB or the Next runtime.

import { eq } from 'drizzle-orm';

import { users } from '@praxis/db';
import { type Database, db as defaultDb } from '@praxis/db/client';

export type AdminAccess = 'allow' | 'redirect-signin' | 'redirect-dashboard';

/** Pure guard decision. Unauthenticated → sign in; signed-in non-admin →
 *  dashboard; admin → allowed. */
export function adminAccess(opts: { signedIn: boolean; isAdmin: boolean }): AdminAccess {
  if (!opts.signedIn) return 'redirect-signin';
  if (!opts.isAdmin) return 'redirect-dashboard';
  return 'allow';
}

/** True iff the user has the admin role. Server-side only. */
export async function isUserAdmin(userId: string, db: Database = defaultDb): Promise<boolean> {
  const rows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.role === 'admin';
}
