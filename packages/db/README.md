# @praxis/db

Postgres schema, client, and migrations for Praxis. Drizzle ORM over
the `postgres-js` driver.

## Stack

- **Drizzle ORM** for the typed query builder + schema-as-TypeScript.
- **`postgres-js`** driver (Bun-native; matches the orchestrator's
  runtime in STORY-05).
- **drizzle-kit** for migration generation and the introspection
  round-trip that powers the codegen drift check.

## Layout

```
packages/db/
├── drizzle.config.ts        configure dialect, schema path, migration table
├── migrations/              generated SQL — DO NOT hand-edit
│   ├── 0000_initial.sql
│   └── meta/_journal.json
├── scripts/
│   └── codegen.ts           round-trip introspect → regenerate types
├── src/
│   ├── schema.ts            ← source of truth (12 tables + 1 index)
│   ├── client.ts            exports `db`, connects via DATABASE_URL
│   ├── generated/           ← codegen output; committed; CI checks drift
│   │   └── types.ts
│   └── index.ts             barrel
```

## Quick start

```bash
# 1. Bring up Postgres (from repo root)
docker compose -f infrastructure/deploy/docker-compose.dev.yml up -d postgres

# 2. Apply migrations
DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5432/praxis \
  pnpm db:migrate

# 3. Verify
psql postgres://praxis:praxis@127.0.0.1:5432/praxis -c '\dt'
```

## Schema source of truth

The Drizzle TypeScript schema at `src/schema.ts` rules. The verbatim
SQL in `docs/project_plan.md` §9 was the **one-time reference** for the
initial transliteration in TASK-010; once we ship the first migration,
§9 is historical and `schema.ts` is canonical.

To change the schema:

1. Edit `src/schema.ts`.
2. Run `pnpm db:generate` — Drizzle writes a new migration file under
   `migrations/`.
3. Run `pnpm db:migrate` against a dev DB to apply.
4. Run `pnpm db:codegen` to regenerate `src/generated/types.ts`.
5. Commit `schema.ts` + the new `migrations/*.sql` + the regenerated
   `generated/types.ts` together.

CI fails if `generated/types.ts` is stale relative to `schema.ts`.

## Consumers

Import from the workspace package — pnpm symlinks resolve it; no
tsconfig path mapping needed.

```ts
import { db, users, type User } from '@praxis/db';

const me = await db.select().from(users).where(eq(users.id, '...')).limit(1);
```

`apps/web` and `services/orchestrator` both add
`"@praxis/db": "workspace:*"` to their dependencies when they need DB
access.
