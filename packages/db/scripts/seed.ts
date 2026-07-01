#!/usr/bin/env tsx
// Seed a fresh local database: the single local operator + the curated learning
// links. Idempotent — safe to re-run.
//
//   DATABASE_URL=postgres://… pnpm db:seed
//
// Run once after `pnpm db:push` creates the tables.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { seedLearningLinks } from '../seeds/learning-links.js';
import { LOCAL_USER_EMAIL, LOCAL_USER_ID, LOCAL_USER_NAME } from '../src/local-user.js';
import * as schema from '../src/schema.js';
import { users } from '../src/schema.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const sql = postgres(url, { max: 1 });
  try {
    const db = drizzle(sql, { schema });

    // The one local user. onConflictDoNothing on the fixed id makes re-runs safe.
    await db
      .insert(users)
      .values({ id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL, displayName: LOCAL_USER_NAME })
      .onConflictDoNothing({ target: users.id });
    console.log(`[seed] local user ${LOCAL_USER_EMAIL} (${LOCAL_USER_ID}) ready`);

    const { inserted, skipped } = await seedLearningLinks(db);
    console.log(`[seed] learning links: inserted ${inserted}, skipped ${skipped} already present`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
