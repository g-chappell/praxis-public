import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export { schema };

// Lazy singleton — Next.js's build-time page-data collection imports
// route modules without env, and throwing at module load (or opening
// a real connection at module load) breaks the build. Construct the
// pool on first `db` access; CI's build phase, which never actually
// hits a route handler, sees only the proxy and never opens a socket.

type DrizzleDb = PostgresJsDatabase<typeof schema>;

let _db: DrizzleDb | undefined;

function buildDb(): DrizzleDb {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  // Single connection pool. max=10 keeps us under shared-DB connection
  // limits without needing pgbouncer at POC scale.
  const sql = postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}

/** Proxy that defers construction until the first property access.
 *  Property-access semantics match a real Drizzle db so callers don't
 *  need to wrap `await getDb()` everywhere. */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    if (!_db) {
      _db = buildDb();
    }
    return Reflect.get(_db, prop);
  },
});

export type Database = DrizzleDb;
