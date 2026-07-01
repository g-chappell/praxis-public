# Conventions — database

Postgres + Drizzle patterns earned during STORY-03 and STORY-04.
Cookbook split out of `AGENTS.md` tier-3.

## Drizzle is the source of truth

- **Schema lives in TypeScript** at `packages/db/src/schema.ts`.
  Drizzle's `pg-core` builders are the authoritative description of
  the database.
- **`project_plan.md` §9 SQL is a one-time verification artefact** —
  the spec we wrote the schema against, not a live migration source.
  When schema and §9 diverge, the TS schema wins; if the divergence
  is intentional, file an ADR.
- **Migrations are generated** with `pnpm db:generate` (drizzle-kit)
  and **committed** to `packages/db/migrations/`. Don't hand-edit
  generated SQL — re-generate after schema changes and review the
  diff. When you generate on a branch cut from an old `main`, the
  migration number may collide with one merged meanwhile — re-run
  `db:generate` on top of current `main` so it lands as the next free
  number.
- **Dev/test:** apply with `pnpm db:migrate`. **Prod is different — it
  has no Drizzle journal; see "Prod migrations are manual" below.**
  Migration runs are not coupled to service boot.
- See ADR-0005 for why Better Auth's `session` and `verification`
  tables are owned by BA's migration set, not ours.

## Prod migrations are manual (no journal) — apply them by hand, right after merge

The prod DB (`praxis-db` container on the VPS, `praxis`/`praxis`) was
established with `drizzle-kit push` (schema-diff), so it has **no
`__drizzle_migrations` / `praxis_migrations` journal**. Running
`pnpm db:migrate` against prod would treat every migration as unapplied
and replay `0000`→latest, colliding on un-guarded `CREATE TYPE`/table
statements. **Never `db:migrate` against prod.**

Instead, apply the one new migration's SQL directly:

```bash
docker exec -i praxis-db psql -U praxis -d praxis -v ON_ERROR_STOP=1 \
  < packages/db/migrations/NNNN_<name>.sql
# then verify
docker exec praxis-db psql -U praxis -d praxis -c '\d <table>'
```

(The dev DB is a separate container, `praxis-db-dev2` on `:5433`.)

**This makes every migration PR an operator follow-up — and flagging it
is not enough; _execute it immediately after merge_.** Nothing in the
deploy applies it, and a missing column/table fails **silently** for a
while: best-effort writes (e.g. `recordAudit`) swallow the error, and a
feature only breaks when its query is first exercised. STORY-38's
`0009` (the `provider` column) was flagged but left unapplied and
silently broke the live admin-keys page + `POST /sessions` until it was
caught tasks later. Apply, verify with `\d`, then move on. **Applied
ledger:** 0008 (STORY-43 audit_log), 0009 (STORY-38 multi-provider),
0010 (STORY-15 mcp_usage) — all applied 2026-06-06; 0006 (STORY-39
`projects.description`), 0007 (STORY-40 `projects.archived_at`) — applied
2026-06-07 (they had been **missed** in the EPIC-07 rollout and silently
broke the dashboard/login projects query until a later redeploy first
exercised it — the same silent-failure trap as 0009). **Lesson:** when
catching up the ledger, reconcile the _whole_ `0000…latest` range against
prod's `\d`, not just the newest migration. 0011 (STORY-45 `audit_action`
enum value `user.role_changed` + `users.banned_at`) — applied 2026-06-07,
right after the #330 merge (additive, so applied before the web deploy to
avoid a missing-column window on `/admin/users`). 0012 (STORY-46
`users.ban_reason` + `email_blocklist` table + `audit_action` values
`user.banned`/`user.unbanned`/`blocklist.added`/`blocklist.removed`) —
applied 2026-06-07 around the #332 merge (additive). 0013 (STORY-22 `usage_events` table) — applied 2026-06-08 around the #337 merge (additive). 0014 (STORY-23 `projects.budget_usd` numeric default 10.00) — applied 2026-06-08 around the #339 merge (additive, default-backfilled).

## Two import surfaces from `@praxis/db`

`@praxis/db` deliberately exposes two entry points so callers don't
trip over the live connection at module load:

| Import | What's in it | Safe to import from |
|---|---|---|
| `@praxis/db` | Schema (`users`, `projects`, …), inferred TS types, enum constants | Anywhere — Node, Next.js build-time, tests, edge runtimes |
| `@praxis/db/client` | The `db` Drizzle client | Runtime-only code paths (server actions, API routes, orchestrator handlers) |

Tests and codegen scripts import from `@praxis/db`. Runtime code that
actually queries imports `db` from `@praxis/db/client`. **Never**
re-export `db` from `@praxis/db` — that breaks the build-time
isolation.

## Lazy initialization for env-dependent modules

Next.js page-data collection imports every module reachable from a
route, including ones that read `process.env` at module top-level.
A naive `const db = drizzle(postgres(process.env.DATABASE_URL!))`
**throws during `next build`** even if no page calls it.

The fix is a Proxy that defers initialization until first property
access:

```ts
// packages/db/src/client.ts (paraphrased)
let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  _db = drizzle(postgres(url, { max: 10 }), { schema });
  return _db;
}
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (_t, prop) => Reflect.get(getDb(), prop),
});
```

The same pattern is used for the Better Auth singleton
(`apps/web/src/lib/auth.ts`) and the Resend mailer
(`apps/web/src/lib/mail.ts`). Rule: **if a module reads env, lazy-init
it.** Throwing at first real use is fine; throwing at module load
breaks tooling.

## Codegen drift check

`packages/db` has a `drift-check` script that walks the TS schema and
asserts the column shape matches `project_plan.md` §9 cell-for-cell
(name, type, nullable, default, references). It runs in CI and does
**not** need a live database — it's a pure-TypeScript walk.

When you change the schema *intentionally* (e.g. add a column to
support a story), update the drift-check expectations in the same PR
or the check fails. The check is a tripwire against unintended
divergence, not a freeze on the schema.

## Local Postgres for dev + tests

- Dev DB: `pnpm db:up` brings up Postgres 16 via Docker Compose
  (`infrastructure/deploy/docker-compose.dev.yml`).
- Tests use the same instance unless the test file imports
  `testcontainers` directly — `packages/db/src/test/with-db.ts` is
  the shared helper.
- **No mocking the database** in tests that touch persistence
  (tier-3 testing rule). We got burned in past projects when
  mock-shaped queries diverged from the real Postgres parser; spin a
  real one.

## Connection pooling

- `postgres-js` driver with `{ max: 10 }` per process — fine for both
  Next.js (one pool per server-component render) and the orchestrator
  (Bun, one pool per process).
- For per-request lifecycles, **reuse the singleton** — don't open a
  fresh connection per request. The Proxy above ensures one pool per
  process.
- The orchestrator does **not** speak directly to the database in
  STORY-05; that lands later. The lazy pattern is in place so future
  routes can `import { db } from '@praxis/db/client'` without
  refactoring.
