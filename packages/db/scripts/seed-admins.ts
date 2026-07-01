#!/usr/bin/env tsx
// Idempotent admin seed (STORY-20 / EPIC-05). Marks the platform's contributor
// accounts as `role = 'admin'` based on PRAXIS_ADMIN_EMAILS (comma/whitespace
// separated). Safe to re-run: it's a plain UPDATE keyed by email, so a fresh
// `db:migrate && db:seed:admins` reproduces admin state on any rebuild.
//
//   PRAXIS_ADMIN_EMAILS="a@x.com,b@y.com" pnpm --filter @praxis/db db:seed:admins
//
// An account only flips once it exists (a user row is created on first sign-in),
// so re-running after a contributor's first login is expected.

import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { parseAdminEmails } from '../src/admin-seed.js';
import * as schema from '../src/schema.js';

async function main(): Promise<void> {
  const emails = parseAdminEmails(process.env.PRAXIS_ADMIN_EMAILS);
  if (emails.length === 0) {
    console.warn('[seed-admins] PRAXIS_ADMIN_EMAILS not set or empty — no admins seeded.');
    return;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  // Own short-lived connection so the script exits cleanly (the shared lazy
  // client proxy in src/client.ts has no close handle).
  const sql = postgres(url, { max: 1 });
  try {
    const db = drizzle(sql, { schema });
    const updated = await db
      .update(schema.users)
      .set({ role: 'admin' })
      .where(inArray(schema.users.email, emails))
      .returning({ email: schema.users.email });

    console.log(
      `[seed-admins] marked ${updated.length}/${emails.length} account(s) admin` +
        (updated.length ? `: ${updated.map((u) => u.email).join(', ')}` : ''),
    );
    const missing = emails.filter((e) => !updated.some((u) => u.email === e));
    if (missing.length > 0) {
      console.warn(
        `[seed-admins] no account yet for: ${missing.join(', ')} — ` + 're-run after they sign in.',
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[seed-admins] failed:', err);
  process.exit(1);
});
