// Praxis (local, single-user) Postgres schema — the source of truth.
//
// A local install has exactly one user (seeded with a fixed id, see
// scripts/seed.ts). There are no teams, auth sessions, or platform keys:
// the agent runs on the operator's own ANTHROPIC_API_KEY from the environment.
//
// Apply to a fresh local database with `pnpm db:push` (drizzle-kit push) —
// no migration chain to maintain.

import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ─── users ────────────────────────────────────────────────────────────
// The single local operator. Seeded once with LOCAL_USER_ID; kept as a table
// (rather than inlined) so projects/events retain a stable owner FK and the
// door stays open to real auth later.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── projects ─────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  templateId: text('template_id').notNull(),
  harness: text('harness').notNull().default('claude-code'),
  // The project's persistent ACP agent session id. Set after a fresh agent
  // opens; passed back as resumeSessionId on the next open so the agent resumes
  // the prior conversation via session/load. Null until first run.
  agentSessionId: text('agent_session_id'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Soft-archive flag: null = active, set = hidden from the default dashboard
  // list. Reversible; distinct from destructive delete.
  archivedAt: timestamp('archived_at', { withTimezone: true }),
});

// ─── sessions ─────────────────────────────────────────────────────────
// One row per sandbox boot: start time, container id, preview URL, end time.
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  containerId: text('container_id'),
  previewUrl: text('preview_url'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

// ─── events ───────────────────────────────────────────────────────────
// Chat transcript + agent events, project-scoped so history survives across
// sandbox boots. Indexed by (project_id, created_at).
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_events_project_time').on(table.projectId, table.createdAt)],
);

// ─── mcp_usage ────────────────────────────────────────────────────────
// Per-project, per-day, per-tool call counter for the image-gen MCP tool. The
// orchestrator increments + cap-checks this on behalf of the in-sandbox MCP
// server (which never touches the DB directly). PK is (project_id, tool, day)
// so each day starts fresh.
export const mcpUsage = pgTable(
  'mcp_usage',
  {
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    tool: text('tool').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.tool, table.day] })],
);

// ─── learning_links ───────────────────────────────────────────────────
// Curated docs/links surfaced in the workspace learning panel.
export const learningLinks = pgTable('learning_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  topic: text('topic').notNull(),
  source: text('source'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow(),
});

// `sql` is imported above so `defaultRandom()` (which emits gen_random_uuid())
// works on PG13+ without the pgcrypto extension. PG16 ships gen_random_uuid
// in core.
export { sql };
