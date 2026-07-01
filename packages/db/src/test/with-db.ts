// Shared test helper for persistence tests (tier-3 rule: no DB mocks —
// spin a real Postgres). Tests that touch the DB are gated behind
// RUN_DB_TESTS=1 so CI without a database still passes; locally,
// `pnpm db:up` then `RUN_DB_TESTS=1 TEST_DATABASE_URL=... vitest`.

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';

export type TestDb = PostgresJsDatabase<typeof schema>;

export function testDatabaseUrl(): string | null {
  return process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

/** True only when DB tests are explicitly enabled and a URL is available. */
export function dbTestsEnabled(): boolean {
  return process.env.RUN_DB_TESTS === '1' && testDatabaseUrl() !== null;
}

/** Open a short-lived pool against the test DB, run `fn`, always close it. */
export async function withDb<T>(fn: (db: TestDb) => Promise<T>): Promise<T> {
  const url = testDatabaseUrl();
  if (!url) {
    throw new Error('withDb: no TEST_DATABASE_URL or DATABASE_URL set');
  }
  const sql = postgres(url, { max: 1 });
  try {
    return await fn(drizzle(sql, { schema }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
