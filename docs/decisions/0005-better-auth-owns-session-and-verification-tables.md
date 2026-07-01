# 0005 — Better Auth owns the `session` and `verification` tables; `users` stays Praxis-canonical

**Date:** 2026-05-31
**Status:** Accepted

## Context

`docs/project_plan.md` §9 originally declared four auth-related tables: `users`, `auth_sessions`, `magic_link_tokens`, `oauth_tokens`. STORY-04's roadmap commits us to **Better Auth** (`better-auth` npm package) for magic-link sign-in.

Better Auth's Drizzle adapter, plus the magic-link plugin specifically, expects a particular table shape:

- **`user`** — id (configurable: text or uuid), email, emailVerified, name, image, createdAt, updatedAt
- **`session`** — id, token (unique), userId, expiresAt, ipAddress, userAgent, createdAt, updatedAt
- **`verification`** — id, identifier (email), value (token), expiresAt, createdAt, updatedAt
- **`account`** — for OAuth providers (not used by magic-link; deferred to STORY-06)

The shape diverges from §9 in three ways:

1. **Column naming** (`emailVerified` vs `email_verified` etc.) — BA's API is camelCase by convention.
2. **PK type** — BA defaults to `text` PK with app-generated IDs; §9 uses `uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
3. **Table presence** — BA's `session` and `verification` replace §9's `auth_sessions` and `magic_link_tokens`, but the columns are not 1:1 renames.

We considered four options before settling:

- **A. Adopt BA's full schema** including text PKs. Cascades FK type changes across 8 other tables (teams, team_memberships, team_invites, projects, sessions, events, agent_turns, oauth_tokens — every table that references `users.id`). Big blast radius.
- **B. Customize BA to use our schema** via a hand-rolled adapter. Doable for `users` but fights the magic-link plugin's expectations on `verification`. High maintenance cost on a load-bearing dependency.
- **C. Run BA's schema in parallel** with ours. Same FK cascade problem as A — every Praxis-app table FK'ing to `users` must change PK type.
- **D. Hand-roll magic-link, skip BA entirely.** ~150 lines. Avoids the schema fork now but commits us to hand-rolling OAuth in STORY-06, session management, etc.

## Decision

**Hybrid (call it "B′"):**

- **`users` stays Praxis-canonical.** UUID PK, snake_case columns. Add three BA-required columns to the existing table: `email_verified boolean NOT NULL DEFAULT false`, `image text`, `updated_at timestamp with time zone DEFAULT now()`. The Praxis `display_name` column stays (BA's `name` is mapped to it via the adapter's `fields` map).
- **`session` and `verification` are new BA-owned tables**, using snake_case column names. The adapter's `fields` map bridges BA's camelCase API to those columns. The TS export name in `packages/db/src/schema.ts` for BA's session table is `authSession` (avoids colliding with the existing `sessions` table for project workspaces).
- **`auth_sessions` and `magic_link_tokens` from §9 are dropped.** They had no consumers outside this story.
- **`oauth_tokens` stays.** BA's `account` table is unused at POC and STORY-06 will revisit (likely we keep `oauth_tokens` and skip BA's `account`).

BA's `advanced.database.generateId: () => crypto.randomUUID()` configuration ensures BA generates UUIDs (matching our PK type) instead of its default text IDs.

## Consequences

- **Easier:** no FK type cascade. Existing Drizzle table definitions for `teams`, `projects`, `events`, etc. don't change. The STORY-03 migration (`0000_cooing_wrecker.sql`) stays valid; STORY-04 ships a single follow-up migration (`0001_*.sql`) that ALTERs `users`, DROPs the two stale tables, CREATEs `session` + `verification`.
- **Easier:** `users` retains its Praxis-app columns (`display_name`); we don't lose anything in the merge.
- **Harder:** the `fields` mapping in `apps/web/lib/auth.ts` is the only thing bridging BA's camelCase to our snake_case. A future BA upgrade that changes the `fields` API would need updating here. Mitigated by pinning `better-auth` at `^1.2.0`.
- **Now true:**
  - **`session` + `verification` exist as Postgres tables**, owned by BA. Consumers should not write to them directly.
  - **`auth_sessions` and `magic_link_tokens` no longer exist.** Any future story that references them in code needs to use BA's API instead.
  - **The pre-existing `sessions` table** (STORY-03, project-workspace sessions) is unrelated and not touched.
  - **`users.email_verified` is always `true` for magic-link users** post-verification (BA sets it). This is the canonical "user has verified ownership of this email" signal.
- **Reversibility:** flipping to pure A (full BA schema) later is a big migration (FK type cascade). Flipping to pure D (hand-rolled) is also non-trivial because BA owns the session-cookie logic by then. The B′ decision is sticky — accept it now or pick D before STORY-04 ships.

## Alternatives considered

See Context. A (full BA), B (custom adapter), C (parallel schemas), and D (hand-roll) all evaluated. D was the closest second; chosen against because Praxis's roadmap commits to BA for STORY-06's OAuth too, and rebuilding session management would surface again then.

## Updates to other docs

- `docs/project_plan.md` §9 — `users` row annotated with the added columns; `auth_sessions` and `magic_link_tokens` rows struck through with a pointer to this ADR; `session` and `verification` added.
- `packages/db/src/schema.ts` — schema reflects all of the above. Export name `authSession` is the (only) deviation from "the TS identifier matches the table name"; documented inline.

Supersedes (partially) the auth-table portions of `docs/project_plan.md` §9.
