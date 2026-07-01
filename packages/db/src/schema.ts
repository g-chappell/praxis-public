// Praxis Postgres schema — mirrors docs/project_plan.md §9 exactly.
//
// Convention: this file is the source of truth. The SQL in §9 of the
// project plan is a one-time reference for the initial transliteration;
// once this schema diverges (via Drizzle migrations), §9 lags. New work
// edits this file and regenerates a migration via `pnpm db:generate`.
//
// 12 tables + 1 supporting index (idx_events_project_time on events).
// Anything outside this list is post-POC scope (skills, portfolio,
// subscriptions, admin) — see project_plan.md §15.

import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Authorization role on a user. 'admin' unlocks the /admin area (EPIC-05).
// Seeded for the platform's contributors; everyone else defaults to 'user'.
export const userRole = pgEnum('user_role', ['user', 'admin']);

// Provider a platform_api_keys row belongs to (STORY-38). Anthropic powers all
// agent inference (ADR-0009); OpenAI powers the image-gen MCP server (STORY-15).
// Platform-owned only — out of scope: per-user keys, providers beyond these two.
export const keyProvider = pgEnum('key_provider', ['anthropic', 'openai']);

// ─── users ────────────────────────────────────────────────────────────
// Praxis-canonical identity table. STORY-01's `display_name` stays;
// STORY-04 adds Better Auth's required columns (`email_verified`,
// `image`, `updated_at`). The schema-fields mapping in apps/web/lib/
// auth.ts is what bridges Better Auth's camelCase API to these
// snake_case columns. See ADR-0005.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  displayName: text('display_name'),
  image: text('image'),
  role: userRole('role').notNull().default('user'),
  // Set when an admin bans the user; null = active. STORY-45 shows this status in
  // the admin users directory; STORY-46 wires the ban action + magic-link-gate.
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  // The reason captured when the user was banned (STORY-46); null when not banned.
  banReason: text('ban_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─── session (BA's authentication session) ──────────────────────────
// Owned by Better Auth (STORY-04). Stores active login sessions; the
// session cookie carries the opaque `id` only. Supersedes STORY-01's
// dropped `auth_sessions` placeholder. See ADR-0005.
//
// The TS export name is `authSession` to avoid colliding with the
// pre-existing `sessions` project-session table (codegen would emit
// `Session` for both). The underlying Postgres table name stays
// `session` (Better Auth's default); the BA `drizzleAdapter`'s
// `schema` map bridges BA's "session" → `authSession`.
export const authSession = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── verification ─────────────────────────────────────────────────────
// Owned by Better Auth's magic-link plugin (STORY-04). Stores one-time
// verification tokens (the magic-link's secret); rows are short-lived
// (expires_at = now() + ~5 minutes). Supersedes STORY-01's dropped
// `magic_link_tokens` placeholder. See ADR-0005.
export const verification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─── oauth_tokens ─────────────────────────────────────────────────────
// access_token_encrypted / refresh_token_encrypted are populated by
// packages/crypto (STORY-06). This schema only carries the bytes —
// encryption/decryption is the consumer's concern.
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    provider: text('provider').notNull(),
    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [unique('oauth_tokens_user_provider_unique').on(table.userId, table.provider)],
);

// ─── platform_api_keys ────────────────────────────────────────────────
// The platform-owned API keys that power agent sessions: Anthropic for all
// inference (ADR-0009) and OpenAI for the image-gen MCP server (STORY-38),
// admin-managed (STORY-21). Encrypted at rest via @praxis/crypto (same posture
// as oauth_tokens) — `key_encrypted` is ciphertext, never the raw key. One
// active key per provider with rotation: setting a new key marks the prior row
// for that provider inactive (retained for audit). The partial unique index
// guarantees at most one active key per provider at the DB level.
export const platformApiKeys = pgTable(
  'platform_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keyEncrypted: text('key_encrypted').notNull(),
    provider: keyProvider('provider').notNull().default('anthropic'),
    active: boolean('active').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    lastRotatedAt: timestamp('last_rotated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('one_active_platform_key_per_provider')
      .on(table.provider)
      .where(sql`${table.active}`),
  ],
);

// ─── teams ────────────────────────────────────────────────────────────
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── team_memberships ─────────────────────────────────────────────────
export const teamMemberships = pgTable(
  'team_memberships',
  {
    teamId: uuid('team_id')
      .references(() => teams.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

// ─── team_invites ─────────────────────────────────────────────────────
export const teamInvites = pgTable('team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' })
    .notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedBy: uuid('accepted_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── projects ─────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id')
    .references(() => teams.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description'),
  templateId: text('template_id').notNull(),
  harness: text('harness').notNull().default('claude-code'),
  // The project's persistent ACP agent session id (ADR-0017/STORY-36). Set after
  // a fresh agent opens; passed back as resumeSessionId on the next open so the
  // agent resumes the prior conversation via session/load. Null until first run.
  agentSessionId: text('agent_session_id'),
  // Prompt-control mode for the shared agent (STORY-34): 'serialised' (default —
  // prompts queue + run FIFO) or 'turn_based' (one holder at a time). Owner-only
  // to change; persists per project across sessions.
  controlMode: text('control_mode').notNull().default('serialised'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  // Soft-archive flag (STORY-40): null = active, set = hidden from the default
  // dashboard list. Reversible; distinct from destructive delete (STORY-28).
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  // Per-project spend cap in USD (STORY-23). When cumulative estimated cost
  // (sum of usage_events) reaches this, new prompts are paused until it's raised
  // by the owner or an admin. Default is a sensible POC cap.
  budgetUsd: numeric('budget_usd', { precision: 12, scale: 2 }).notNull().default('10.00'),
});

// ─── sessions ─────────────────────────────────────────────────────────
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
// Indexed by (project_id, created_at) — the only index in §9.
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

// ─── audit_action ─────────────────────────────────────────────────────
// Accountability actions written to audit_log (STORY-43). Covers the
// currently-wired admin/destructive actions; extend the list as new
// audited actions land (EPIC-08 bans, role changes, etc.).
export const auditAction = pgEnum('audit_action', [
  'project.deleted',
  'project.archived',
  'project.restored',
  'project.updated',
  'project.duplicated',
  'api_key.rotated',
  'user.role_changed',
  'user.banned',
  'user.unbanned',
  'blocklist.added',
  'blocklist.removed',
  'connector.created',
  'connector.updated',
  'connector.deleted',
  'connector.template_changed',
  'team.renamed',
  'team.member_removed',
  'team.member_left',
]);

// ─── audit_log ────────────────────────────────────────────────────────
// The accountability backbone (STORY-43): one append-only row per
// admin/destructive action, added alongside — never replacing — the
// existing console.info stdout logs. Indexed for the three query
// dimensions the viewer (STORY-47) needs: by actor, by target, by time.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id')
      .references(() => users.id)
      .notNull(),
    action: auditAction('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    metadata: jsonb('metadata'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_audit_log_actor_time').on(table.actorUserId, table.createdAt),
    index('idx_audit_log_target_time').on(table.targetType, table.targetId, table.createdAt),
    index('idx_audit_log_created').on(table.createdAt),
  ],
);

// ─── email_blocklist ──────────────────────────────────────────────────
// Emails/domains barred at the magic-link gate (STORY-46). `value` is the
// lowercased address (is_domain=false) or bare domain like "spam.test"
// (is_domain=true); the gate matches an address against both forms.
export const emailBlocklist = pgTable('email_blocklist', {
  id: uuid('id').primaryKey().defaultRandom(),
  value: text('value').notNull().unique(),
  isDomain: boolean('is_domain').notNull().default(false),
  reason: text('reason'),
  addedBy: uuid('added_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── agent_turns ──────────────────────────────────────────────────────
export const agentTurns = pgTable('agent_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
  promptingUserId: uuid('prompting_user_id').references(() => users.id),
  promptText: text('prompt_text').notNull(),
  responseText: text('response_text'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ─── usage_events ─────────────────────────────────────────────────────
// Per-turn token usage, attributed to project + session (STORY-22). One row per
// completed agent turn (ADR-0009 surfaces input/output tokens on turn-complete).
// estimated_cost_usd is an ESTIMATE computed at record time — ACP doesn't expose
// the model, so the orchestrator applies a documented per-token rate. The data
// foundation for the owner usage view + budget caps (STORY-23).
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_usage_events_project_time').on(table.projectId, table.createdAt)],
);

// ─── learning_links ───────────────────────────────────────────────────
export const learningLinks = pgTable('learning_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  topic: text('topic').notNull(),
  source: text('source'),
  addedAt: timestamp('added_at', { withTimezone: true }).defaultNow(),
});

// ─── mcp_usage ────────────────────────────────────────────────────────
// Per-project, per-day, per-tool call counter for MCP tools (STORY-15/TASK-043).
// The orchestrator increments + cap-checks this on behalf of the in-sandbox MCP
// server (which never touches the DB directly — no creds in the sandbox). PK is
// (project_id, tool, day) so each day starts fresh.
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

// ─── mcp_connectors ───────────────────────────────────────────────────
// Admin-curated catalog of MCP connectors (STORY-50, ADR-0020). `command_ref`
// is a KEY into an allow-list of wrappers baked into the sandbox-base image —
// never a free-form command (security). `credentials_encrypted` is @praxis/crypto
// ciphertext (never returned plaintext); delivered to the sandbox via the
// ADR-0018 ephemeral cred-file outside /workspace. `usage_cap` is a per-day cap
// enforced via mcp_usage. Definition only — where a connector is USED is the
// per-template map below.
export const mcpConnectors = pgTable('mcp_connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  commandRef: text('command_ref').notNull(),
  args: jsonb('args'),
  credentialsEncrypted: text('credentials_encrypted'),
  usageCap: integer('usage_cap'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── template_mcp_connectors ──────────────────────────────────────────
// Per-template enablement of catalog connectors (STORY-50, ADR-0020). A
// connector reaches a project's sandbox only if `enabled` for that project's
// `template_id`; `allowed_commands` is the permitted subset of the connector's
// tools for the template (null = all), enforced via Claude tool-permission
// settings (mcp__<name>__<command>).
export const templateMcpConnectors = pgTable(
  'template_mcp_connectors',
  {
    templateId: text('template_id').notNull(),
    connectorId: uuid('connector_id')
      .references(() => mcpConnectors.id, { onDelete: 'cascade' })
      .notNull(),
    enabled: boolean('enabled').notNull().default(false),
    allowedCommands: jsonb('allowed_commands'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.connectorId] })],
);

// `sql` is imported above so `defaultRandom()` (which emits gen_random_uuid())
// works on PG13+ without the pgcrypto extension. PG16 ships gen_random_uuid
// in core.
export { sql };
