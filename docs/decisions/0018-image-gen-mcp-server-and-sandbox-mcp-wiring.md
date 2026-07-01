# 0018 — Image-gen MCP server + how MCP servers wire into the sandbox

**Date:** 2026-06-05 (updated 2026-06-06)
**Status:** Accepted (operator-confirmed 2026-06-06). Implements STORY-15: TASK-042 (server) + TASK-043 (usage cap) shipped in #310; TASK-044 (sandbox wiring) implemented per the decisions below. **Update 2026-06-06:** the multi-provider platform-keys dependency in §Decision 5 shipped as **STORY-38** (#309) — `platform_api_keys` carries a `provider` column with a one-active-per-provider constraint, and `POST /sessions` decrypts + plumbs the active OpenAI key into the room (`openaiKey`).

**TASK-044 implementation notes:**
- Secrets reach the in-sandbox server via an ephemeral cred file at **`/run/praxis-mcp/config.json`** (absolute, outside `/workspace` → never git/MinIO), written by the orchestrator (`services/orchestrator/src/mcp-seed.ts`) via `Sandbox.writeFile`. The server (`infrastructure/mcp-servers/image-gen/src/config.ts`) reads it on startup, env vars as fallback.
- The project **`.mcp.json`** (seeded into `/workspace`, no secrets) points the server at the cred file via the non-secret `PRAXIS_MCP_CONFIG` env. Its `command: praxis-mcp-image-gen` resolves to a wrapper baked into `sandbox-base` (an esbuild single-file bundle at `/opt/praxis-mcp/image-gen/index.mjs`). The `${OPENAI_API_KEY}`-expansion idea hinted at in the original TASK-042 server comment is **superseded** by this cred-file approach (expansion would have required the secret in the agent's env).
- Wiring is gated on the template declaring the server (`template.json` `mcp_servers`) **and** an OpenAI key being configured; absent either, nothing is seeded (clean degrade).

## Context

STORY-15 gives the agent a `generate_image` tool (textures for the Three.js
template) backed by the OpenAI Images API. Two things made this ADR-worthy:
MCP is a load-bearing standard (changes need an ADR), and OpenAI is a **new
external dependency**.

The load-bearing question was: **does wiring an MCP server force a change to
`packages/acp-host` (the sacred ACP layer)?** A spike against the real
`praxis-sandbox-base` image (Claude Code 2.1.160, `claude-agent-acp@0.39.0`)
settled it:

- The adapter calls the Claude Agent SDK with `settingSources: ["user","project","local"]`, so Claude Code reads a **project `.mcp.json`** from the cwd (`/workspace`). `acp-host` keeps `mcpServers: []` untouched.
- Verified with `claude mcp list`: a `.mcp.json` alone → server **⏸ Pending approval** (headless can't approve); `.mcp.json` **+** `/workspace/.claude/settings.json` = `{"enableAllProjectMcpServers": true}` → **✓ Connected**.

So MCP discovery is **Path A — pure sandbox filesystem config, no AcpHost change, no ADR for the wiring itself.** What remains is (a) capping a paid API and (b) getting credentials to the in-sandbox server.

## Decision

1. **MCP discovery via filesystem config (Path A).** At project creation the
   orchestrator seeds `/workspace/.mcp.json` (server command + args, no secrets)
   and `/workspace/.claude/settings.json` (`enableAllProjectMcpServers`). Claude
   Code spawns the server itself as a stdio child. `acp-host` is not touched.

2. **The server binary is baked into `sandbox-base`** (bundled), not seeded into
   `/workspace` — it's platform infra, kept out of the user's git history.

3. **Usage cap is orchestrator-mediated (TASK-043, built).** The in-sandbox
   server holds **no DB credentials**. Each room mints a capability token
   (`runtime.ts`) that resolves to exactly one project; the server presents it to
   `POST /internal/mcp/usage`, which atomically increments-while-under-cap against
   `mcp_usage` (default 50/project/day) and fails **closed**.

4. **Credentials reach the server via an orchestrator-written config file, NOT
   the agent env** — chosen to avoid a sacred-layer change. The agent's process
   env is built inside `acp-host` (`{ ANTHROPIC_API_KEY, HOME }`); injecting
   `OPENAI_API_KEY` there would modify the sacred ACP spawn. Instead the
   orchestrator writes an **ephemeral** config (`{ openaiApiKey, usageUrl,
   usageToken }`) to a path **outside the `/workspace` volume** (so it is never
   git-committed nor MinIO-snapshotted) via the existing `sandbox.spawn`, and the
   server reads it on startup (env fallback for local runs).

5. **OpenAI key is a platform-owned key, managed exactly like the Anthropic one**
   (operator decision, 2026-06-05). NOT an operator env-file. `platform_api_keys`
   becomes multi-provider (add a `provider` column; the one-active constraint
   becomes one-active-**per-provider**); the admin UI (STORY-21) manages the OpenAI
   key the same way — paste once, ciphertext-only, masked, rotatable, role-gated.
   `POST /sessions` decrypts the active OpenAI key (Node/libsodium, like the
   Anthropic key) and hands it to the orchestrator, which plumbs it to the server
   via (4). This is EPIC-05 work beyond STORY-15's original tasks — see the roadmap
   refinement (multi-provider platform keys) that TASK-044 now depends on.

## Consequences

- STORY-15 lands almost entirely in orchestrator + sandbox-base + template; the
  sacred `AcpHost`/`Sandbox` *interfaces* are unchanged.
- **Accepted tradeoff:** in-sandbox generation means the OpenAI key is readable by
  code running in the sandbox (any in-container process can read the config). The
  per-project cap limits MCP-mediated spend but not direct key misuse. Acceptable
  for the trusted POC (dogfood/university pairs); a future hardening is
  orchestrator-proxied generation (server sends the prompt to the orchestrator,
  which holds the key and returns bytes) — out of scope here, noted for later.
- **Multi-provider platform keys** (new EPIC-05 work, refined into the roadmap):
  `platform_api_keys` gains a `provider` column; `getActivePlatformKey(provider)`
  and the admin UI are parametrised. TASK-044 depends on this landing first.
- **Operator follow-ups:** paste the OpenAI platform key in the **admin UI** (not
  an env-file); rebuild + redeploy `sandbox-base` with the bundled server (see
  `docs/runbooks/sandbox-base-image.md`). The live e2e (agent adds a stone texture
  → appears in the preview) is verified after both.

## Alternatives considered

- **Pass `mcpServers` through `acp-host`** (Path B) — rejected: the spike showed
  Path A works, so we avoid changing the sacred ACP layer.
- **Inject credentials into the agent env via `acp-host`** — rejected: changes the
  sacred spawn (which also handles the platform Anthropic key); the config-file
  path avoids it.
- **MCP server with direct Postgres access** (as the roadmap literally worded
  TASK-043) — rejected: DB creds in a user-controlled sandbox is a cross-tenant
  breach vector. Orchestrator-mediated capping keeps creds out.
- **Orchestrator-proxied generation** (key never in sandbox) — deferred: cleaner
  but a larger redesign; recorded as the future hardening above.
