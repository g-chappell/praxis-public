import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Rename the default `__drizzle_migrations` table to make multi-tenant
  // co-existence with other Drizzle apps on a shared Postgres unambiguous.
  // Praxis owns its own DB today, but the rename is cheap insurance.
  migrations: {
    table: 'praxis_migrations',
    schema: 'public',
  },
  verbose: true,
  strict: true,
});
