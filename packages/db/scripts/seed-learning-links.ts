#!/usr/bin/env tsx
// Idempotent learning-links seed (STORY-17 / TASK-048). Inserts the curated
// entries in seeds/learning-links.ts that aren't already present, so the
// workspace learning panel always has its baseline set after a rebuild:
//
//   DATABASE_URL=postgres://… pnpm --filter @praxis/db db:seed:learning-links
//
// Safe to re-run: links are matched by url and only the missing ones are added.

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { seedLearningLinks } from '../seeds/learning-links.js';
import * as schema from '../src/schema.js';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  // Own short-lived connection so the script exits cleanly (mirrors seed-admins).
  const sql = postgres(url, { max: 1 });
  try {
    const { inserted, skipped } = await seedLearningLinks(drizzle(sql, { schema }));
    console.log(`[seed-learning-links] inserted ${inserted}, skipped ${skipped} already present`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('[seed-learning-links] failed:', err);
  process.exit(1);
});
