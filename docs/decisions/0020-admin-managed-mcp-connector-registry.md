# 0020 — Admin-managed MCP connector registry

**Date:** 2026-06-08 (revised 2026-06-08 — **per-template** scoping, per
contributor direction; was platform-wide in the first draft)
**Status:** **Accepted** (both contributors signed off 2026-06-08). MCP is a
load-bearing open standard (AGENTS.md); with sign-off in hand, the implementation
tasks (TASK-147–150) may proceed per the decisions below.

**Story:** STORY-50 (EPIC-09). Builds on ADR-0018 (image-gen MCP server + the
"Path A" sandbox MCP wiring) and the platform-key crypto posture (ADR-0009,
`packages/crypto`).

## Context

Today an MCP server reaches the sandbox agent through **static config**
(ADR-0018, "Path A"): a template declares servers in `template.json`
(`mcp_servers`), and at sandbox start `services/orchestrator/src/mcp-seed.ts`
writes the project's `/workspace/.mcp.json` (no secrets) plus a Claude
`settings.json` with `enableAllProjectMcpServers` (via `settingSources`), and
delivers the server's secret through an **ephemeral cred file at
`/run/praxis-mcp/config.json`** — absolute, outside `/workspace` so it never
hits git or MinIO. The server command (`praxis-mcp-image-gen`) resolves to a
**wrapper baked into the `praxis-sandbox-base` image** (an esbuild single-file
bundle on a fixed path). Crucially, **no change to `packages/acp-host`** (the
sacred ACP layer) is needed — that was the load-bearing finding of ADR-0018.

Limitations we want to remove without breaking any of the above:

- The only way to add/enable a connector is a code change (template edit + image
  rebuild). There is no admin surface to enable/disable a connector, set its
  credential, or cap its usage at runtime.
- Image-gen's enablement is implicitly tied to "an OpenAI key is configured" —
  there's no first-class, auditable connector record.

STORY-50 asks for an **admin-managed registry** of connectors (enable/disable,
encrypted credentials, usage caps) that the orchestrator renders into each new
sandbox — **without** changing the ACP host or the Path-A mechanism beyond what
this ADR approves. Per contributor direction, the admin both **curates the
connector catalog** (which MCP servers exist, their credentials/caps, and which
commands each may expose) **and decides, per template, which connectors and
which of their commands are allowed** — so a project gets exactly the MCP
surface its template is configured for (e.g. the Three.js template gets
image-gen; a blank template gets none).

The load-bearing risks: (1) MCP is an open standard we don't want to fork;
(2) a registry that let an admin specify an **arbitrary command string** would
be remote code execution into every sandbox via a DB row; (3) credentials must
keep the encrypted-at-rest + never-in-`/workspace` posture.

## Decision

1. **Two tables: a connector catalog + a per-template enablement map.**

   a. **`mcp_connectors` (the catalog, admin-curated):** `id`, `name` (unique —
   the `.mcp.json` server key), `command_ref` (text — see §2), `args` (jsonb,
   non-secret), `credentials_encrypted` (text, nullable — ciphertext via
   `@praxis/crypto`), `usage_cap` (int, nullable — per-day cap), `created_by`
   (uuid), `created_at`. This is the *definition* of a connector (how to run it,
   its secret, its cap) — independent of where it's used.

   b. **`template_mcp_connectors` (per-template enablement):** `template_id`
   (text — the same id used in `template.json`, e.g. `react-threejs-scene`),
   `connector_id` (uuid → `mcp_connectors`), `enabled` (boolean, default
   **false**), `allowed_commands` (jsonb/text[], nullable — the subset of the
   connector's tools permitted for this template; null = all the connector
   exposes), `created_at`. Primary key `(template_id, connector_id)`.

   So **enablement is per template**: a connector in the catalog only reaches a
   sandbox if there's an `enabled` row for that project's template, and only the
   `allowed_commands` for that template are exposed. A connector with no
   template rows is defined but inert. (Per-*project* overrides remain out of
   scope — additive later.)

2. **`command_ref` is a key into a fixed allow-list of wrappers baked into
   `praxis-sandbox-base`, NOT a free-form shell command.** The orchestrator maps
   `command_ref` → a known baked path (e.g. `image-gen` →
   `praxis-mcp-image-gen`). An unknown `command_ref` renders nothing (clean
   degrade) and is rejected at the admin boundary. **This is the security
   linchpin:** adding a *new* connector type is a deliberate two-step — bake its
   wrapper into `sandbox-base` (a reviewed image change) **then** register a row
   referencing it — never an admin typing a command. This preserves
   "admin-curated only" (STORY-50 out-of-scope: no arbitrary user-supplied MCP
   servers) and keeps arbitrary code out of the sandbox.

3. **Credentials keep the ADR-0009 posture and the ADR-0018 delivery path.**
   `credentials_encrypted` is `@praxis/crypto` ciphertext (same as
   `platform_api_keys`/`oauth_tokens`), written once, **never returned
   plaintext** (admin surfaces show masked/"set" only), rotatable. At sandbox
   start the orchestrator decrypts the *enabled* connectors' creds and writes
   them to the **ephemeral `/run/praxis-mcp/…` file (outside `/workspace`)** —
   exactly the ADR-0018 pattern, generalized from one server to N. No secret
   ever enters `/workspace`, `.mcp.json`, MinIO, or the agent's env.

4. **Per-template enable/disable gates rendering.** A connector reaches a
   sandbox only if `template_mcp_connectors.enabled = true` for that project's
   `template_id`. Disabling a connector for a template means new sandboxes of
   that template don't get it (existing live sandboxes are unaffected until
   restart — acceptable; documented). Catalog-level changes (rotating a
   credential, lowering a cap) apply wherever the connector is enabled.

5. **Orchestrator rendering generalizes `mcp-seed.ts` (Path A preserved).** At
   sandbox start the orchestrator reads the project's `template_id`, joins the
   **enabled** `template_mcp_connectors` rows to the catalog, and renders the
   project `.mcp.json` (one entry per enabled connector: server key = `name`,
   `command` = the baked wrapper for `command_ref`, `args`, non-secret `env`
   pointing at the cred file) plus the Claude `settings.json`. **`allowed_commands`
   is enforced via Claude Code's tool-permission settings** (the rendered
   settings permit only `mcp__<name>__<command>` for the template's allowed
   subset; null = allow the server's full toolset) — so the restriction is
   declarative in settings, not a fork of the server. Still
   `enableAllProjectMcpServers` via `settingSources`. **No `packages/acp-host`
   change** — this is still Path A (ADR-0018). The existing image-gen path is
   refactored to read from the registry: image-gen becomes the first catalog
   entry, enabled for `react-threejs-scene`; the template's `mcp_servers`
   declaration + the OpenAI-key gate are reconciled with the registry, not
   duplicated (a connector with no usable credential renders nothing — clean
   degrade, as today).

6. **Usage caps reuse the `mcp_usage` mechanism (ADR-0018/STORY-15).** A
   connector's `usage_cap` is enforced via the existing per-project/per-tool/
   per-day `mcp_usage` counter + `checkAndIncrement`, keyed by the connector
   `name`. No new cap engine.

7. **Admin surface is role-gated + audit-logged.** CRUD lives behind
   `isUserAdmin` at `/admin/connectors`: manage the catalog (create connector,
   set/rotate credential, set cap) **and** the per-template matrix (enable/
   disable a connector for a template, choose its allowed commands). Every
   change writes an `audit_log` row (new `connector.*` audit actions, including
   the per-template enablement). Fits the EPIC-08 accountability model.

## Consequences

- **New:** `mcp_connectors` (catalog) **and** `template_mcp_connectors`
  (per-template enablement + allowed_commands) tables (+ migration + codegen) —
  this expands roadmap **TASK-147** from one table to two; `/admin/connectors`
  CRUD over the catalog + the per-template matrix (lib + API + UI); orchestrator
  registry-driven, template-scoped rendering; `connector.*` audit actions; a
  Docker-gated integration test proving a connector enabled for a template is
  reachable by that template's sandbox agent (`.mcp.json` present + server
  resolvable + only allowed commands permitted).
- **Security:** no arbitrary command execution (curated `command_ref` →
  allow-listed baked wrapper); credentials encrypted at rest, never returned
  plaintext, delivered only via the ephemeral file outside `/workspace`;
  admin-only; audited.
- **Bounded blast radius:** Path A and the ACP host are unchanged; the change is
  "where the connector list comes from" (registry vs static template), not "how
  MCP reaches the agent."
- **Onboarding a new connector** is a two-step reviewed process (bake wrapper →
  register), by design — not self-service. Acceptable for an admin-curated set.
- Image-gen is migrated onto the registry as the first entry; its template
  declaration + OpenAI-key gate are reconciled, not removed.

## Alternatives considered

- **Status quo (static template config).** Rejected: no runtime admin control of
  enable/disable, credentials, or caps — STORY-50's whole point.
- **Free-form admin-supplied command + args.** Rejected: RCE into every sandbox
  via a DB row. The curated `command_ref` allow-list (baked wrappers) gives the
  flexibility we need without that risk.
- **Platform-wide enablement (every connector on every sandbox).** Rejected per
  contributor direction: the admin scopes connectors **per template**, so each
  template gets only the MCP surface it's configured for (the Three.js template
  gets image-gen; a blank template gets none). Per-*project* overrides remain
  out of scope — additive later on top of the per-template map.
- **Credentials in the agent env (`${VAR}` expansion).** Rejected (also rejected
  in ADR-0018): puts secrets in the agent's environment; the ephemeral cred file
  keeps them out of `/workspace` and the agent env.
- **Native-ACP `mcpServers` param (Path B).** Rejected: would change
  `packages/acp-host` (sacred) for no functional gain over Path A (ADR-0018).

## Sign-off (both contributors) — Accepted 2026-06-08

Per AGENTS.md ("Anything ACP- or MCP-related changes only with an ADR and
confirmation from both contributors"), this ADR required both-contributor
sign-off before TASK-147–150 (tables, orchestrator rendering, admin CRUD,
integration). **Both contributors signed off on 2026-06-08**, resolving the open
questions as decided above:

- `command_ref` allow-list + "bake-then-register" onboarding — confirmed as the
  bound on "admin-curated".
- **Per-template enablement** (catalog + `template_mcp_connectors` map, with
  per-template `allowed_commands` enforced via Claude tool-permission settings,
  `mcp__<name>__<command>` — no server fork) — confirmed.
- Reusing `mcp_usage` for per-connector daily caps — confirmed.

Implementation may proceed.
