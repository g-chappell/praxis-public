import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Local single-user: `drizzle-kit push` syncs the schema straight to the DB
  // (no migration chain). strict:false keeps push non-interactive so it runs
  // unattended in setup + CI.
  strict: false,
  verbose: false,
});
