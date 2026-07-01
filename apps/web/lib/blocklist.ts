// Sign-in gate helpers (STORY-46): decide whether an email may request a magic
// link (banned user or blocklisted email/domain), and revoke a user's sessions
// when they're banned. Used by the magic-link gate in lib/auth.ts and the admin
// ban/blocklist routes. CRUD for the blocklist lives in lib/admin-blocklist.ts.

import { and, eq, isNotNull, or } from 'drizzle-orm';

import { authSession, emailBlocklist, users } from '@praxis/db';
import { type Database, db } from '@praxis/db/client';

/** The domain part of an email (lowercased), or '' when malformed. */
export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0
    ? email
        .slice(at + 1)
        .trim()
        .toLowerCase()
    : '';
}

export type SignInBlock = 'banned' | 'blocklisted' | null;

/** Why sign-in is blocked for this email, or null when allowed. Checked at the
 *  magic-link gate so no email is sent to a blocked address. The `database` is
 *  injectable for tests. */
export async function signInBlockReason(
  email: string,
  database: Database = db,
): Promise<SignInBlock> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const domain = emailDomain(normalized);

  // Blocklist: an exact-email entry, or a domain entry matching this address.
  const domainMatch = domain
    ? and(eq(emailBlocklist.isDomain, true), eq(emailBlocklist.value, domain))
    : undefined;
  const [blocked] = await database
    .select({ id: emailBlocklist.id })
    .from(emailBlocklist)
    .where(
      or(
        and(eq(emailBlocklist.isDomain, false), eq(emailBlocklist.value, normalized)),
        domainMatch,
      ),
    )
    .limit(1);
  if (blocked) return 'blocklisted';

  // A banned user owns this address.
  const [banned] = await database
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalized), isNotNull(users.bannedAt)))
    .limit(1);
  if (banned) return 'banned';

  return null;
}

/** The user-facing message for a blocked sign-in attempt. */
export function signInBlockMessage(reason: Exclude<SignInBlock, null>): string {
  return reason === 'banned'
    ? 'This account has been suspended. Contact support if you think this is a mistake.'
    : 'This email address isn’t permitted to sign in.';
}

/** Delete every Better-Auth session for a user — signs them out everywhere. Used
 *  when an admin bans them (STORY-46). */
export async function revokeUserSessions(userId: string, database: Database = db): Promise<void> {
  await database.delete(authSession).where(eq(authSession.userId, userId));
}
