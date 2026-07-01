// Better Auth configuration — server-side only.
// Consumed by `app/api/auth/[...all]/route.ts` and by middleware/route
// handlers that need to read the current session.
//
// Schema strategy: B′ hybrid (see ADR-0005). Our `users` table stays
// Praxis-canonical (UUID PK + snake_case + Praxis-specific columns).
// Better Auth's `session` and `verification` tables are owned by BA
// but use snake_case names; the `fields` map below bridges BA's
// camelCase API to those columns. The TS export for BA's session
// table is `authSession` (to avoid colliding with the existing
// project-`sessions` table from STORY-03).

import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';

import { authSession, users, verification } from '@praxis/db';
import { db } from '@praxis/db/client';

import { signInBlockMessage, signInBlockReason } from './blocklist';
import { sendMagicLinkEmail } from './mailer';

// Lazy singleton — Next.js's build-time page-data collection imports
// route modules without env, and throwing at module load breaks the
// build. We defer the env check until the first real request. Both
// the route handler and middleware reach the instance via `getAuth()`.
let _auth: ReturnType<typeof buildAuth> | undefined;

function buildAuth() {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not set');
  }

  const baseURL =
    process.env.BETTER_AUTH_URL ??
    (process.env.NODE_ENV === 'production'
      ? 'https://praxis.blacksail.dev'
      : 'http://localhost:3000');

  return betterAuth({
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,

    // Use our existing Postgres + Drizzle setup.
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: users,
        session: authSession,
        verification,
      },
    }),

    // Better Auth's internal API uses camelCase field names which match
    // our Drizzle table *properties* 1:1 (`emailVerified`, `expiresAt`,
    // `userId`, `ipAddress`, `userAgent`, `createdAt`, `updatedAt`).
    // Drizzle handles the snake_case Postgres column names automatically
    // via the `text('display_name')` / `timestamp('expires_at')` calls
    // in schema.ts. So no field remap is needed — the `fields` option
    // expects Drizzle *property* names, not SQL column names.
    //
    // The one exception: BA's `User.name` is our `displayName` property.
    // The schema map in `drizzleAdapter` above already maps BA's `user` /
    // `session` / `verification` keys to our Drizzle exports; `modelName`
    // is intentionally not set here so BA uses those keys directly.
    user: {
      fields: {
        name: 'displayName',
      },
    },

    session: {
      // 7-day session; users sign in once a week. Tune later if needed.
      expiresIn: 60 * 60 * 24 * 7,
    },

    // UUID generator matches our existing schema (uuid PK + defaultRandom()).
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },

    plugins: [
      magicLink({
        // 5-minute link lifetime; balances "I'll click in a minute" with
        // "abandoned email in a coffee shop is now a security risk".
        expiresIn: 60 * 5,
        sendMagicLink: async ({ email, url }) => {
          // Gate sign-in before sending (STORY-46): banned users and
          // blocklisted emails/domains get a friendly error and no email.
          const blocked = await signInBlockReason(email);
          if (blocked) {
            throw new APIError('FORBIDDEN', { message: signInBlockMessage(blocked) });
          }
          await sendMagicLinkEmail({ to: email, url });
        },
      }),
    ],
  });
}

export function getAuth() {
  if (!_auth) {
    _auth = buildAuth();
  }
  return _auth;
}

export type Auth = ReturnType<typeof getAuth>;
