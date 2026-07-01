# ARCHITECTURE.md — Praxis

System shape for the POC. Mirrors `docs/project_plan.md` §2 with the
divergences from STORY-01 already incorporated (single-VPS deploy, no
Cloudflare Pages — see ADR-0001) and EPIC-01 deployment realities
reflected throughout (multi-tenant VPS via Caddy — ADR-0004; Better
Auth schema hybrid — ADR-0005).

**Agent integration pivot (ADR-0009).** The plan assumed Claude Code speaks
ACP natively on each user's Pro/Max subscription. Neither holds: Claude Code
has no native ACP mode (it speaks ACP only via the `claude-agent-acp` adapter),
and a hosted multiplayer platform may not run on a personal subscription
(account-sharing / token-extraction is barred). So inference runs on a
**platform-owned Anthropic API key** under the Commercial Terms, with
per-project usage **metering + budgets** (EPIC-05). The per-user Anthropic
OAuth flow (ADR-0006 / STORY-06) is retained but no longer used for inference.

## High-level shape

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (User A)                    Browser (User B)            │
│  ┌──────────────────┐                ┌──────────────────┐        │
│  │ Next.js frontend │                │ Next.js frontend │        │
│  │ (apps/web)       │                │                  │        │
│  └────────┬─────────┘                └────────┬─────────┘        │
└───────────┼────────────────────────────────────┼─────────────────┘
            │ WebSocket + HTTP (via Caddy TLS)   │
            └──────────────┬─────────────────────┘
                           ▼
          ┌──────────────────────────────────────────┐
          │  Orchestrator (Bun + Hono on VPS)        │
          │  - WebSocket hub (rooms per project)     │
          │  - Prompt queue + attribution            │
          │  - ACP host implementation               │
          │  - Sandbox lifecycle                     │
          │  - Event log writer                      │
          └─────────┬──────────────────┬─────────────┘
                    │                  │
                    ▼                  ▼
       ┌─────────────────────┐  ┌──────────────────────┐
       │ Docker container    │  │ Postgres 16          │
       │ per project (VPS)   │  │                      │
       │                     │  │ - users (+ role)     │
       │ + Claude Code via   │  │ - teams              │
       │   claude-agent-acp  │  │ - projects           │
       │   (ACP over stdio)  │  │ - sessions           │
       │ + platform API key  │  │ - events             │
       │ + project files     │  │ - oauth_tokens       │
       │ + .git/             │  │ - platform_api_keys  │
       │ + MCP server(s)     │  │ - usage_events       │
       │ + preview port      │  │ - learning_links     │
       └─────────────────────┘  └──────────────────────┘
```

All four boxes — `apps/web`, the orchestrator, the per-project sandbox
containers, and Postgres — live on the same VPS for the POC. Caddy
terminates TLS and routes by hostname:

- `praxis.<domain>` → `apps/web` (Next.js, port `:3002`)
- `api.<domain>` → orchestrator (HTTP + `/ws` WebSocket upgrade, port `:4001`)
- `*.preview.<domain>` → on-demand-allocated sandbox ports (future, STORY-07+)

## Current deployment (post-EPIC-01)

What's actually live on the VPS today. Everything below is a Docker
container on the shared `praxis-net` bridge, managed by systemd, and
sharing `/etc/praxis/praxis.env`.

| Container | Image | Public URL | Story | Status |
|---|---|---|---|---|
| `praxis-web` | `ghcr.io/g-chappell/praxis-web:latest` | `https://praxis.blacksail.dev` | STORY-02 / 04 | Live — sign-in works end to end |
| `praxis-orchestrator` | `ghcr.io/g-chappell/praxis-orchestrator:latest` | `https://api.praxis.blacksail.dev` | STORY-05 | Live — `/health` + `/ws` ping/pong |
| `praxis-db` | `postgres:16-alpine` | (internal, bound `127.0.0.1:5432`) | STORY-03 | Live — schema migrated, Better Auth tables present |

Caddy at `:80`+`:443` serves the composite (Praxis + other VPS
tenants — see ADR-0004). TLS via Caddy's built-in ACME.

Mail goes out via Resend (apex `praxis.blacksail.dev`, see ADR-0005
addendum and `docs/conventions/auth-and-mail.md`). Sign-in is magic
link, no password storage.

Deploys: GitHub Actions builds + pushes images on hosted runners; a
**self-hosted runner on the VPS** runs the local `systemctl restart`
(no internet SSH — see ADR-0011). Auto-fires on merge to `main`
touching a service's paths.

## Core principles

- **Orchestrator owns active sessions.** WebSocket hub, prompt queue, ACP
  communication, sandbox lifecycle. Postgres is the persistence layer, not
  the coordination layer.
- **Agents speak ACP — Claude via an adapter.** The orchestrator is an ACP
  host (`packages/acp-host`, an ACP client built on `@agentclientprotocol/sdk`);
  communication is JSON-RPC over stdio. Claude Code has no native ACP mode, so
  the sandbox runs the `@agentclientprotocol/claude-agent-acp` adapter as the
  ACP agent; native-ACP agents (Codex, next phase) slot in behind the same
  `AcpHost` interface. The harness mostly survives the adapter (skills, MCP,
  subagents, CLAUDE.md, slash commands); hooks do not (accepted for the POC).
  See ADR-0009 and `docs/project_plan.md` §4.
- **Sandboxes are Docker containers on a VPS for the POC.** The `Sandbox`
  interface in `packages/sandbox` is abstract; E2B, Firecracker, or Daytona
  implementations slot in later without touching consumers.
- **Real-time uses one transport.** Single WebSocket per user to the
  orchestrator. The orchestrator broadcasts to all members of a project room.
- **Inference runs on a platform-owned API key (ADR-0009).** A multiplayer
  project is owned by one person who inherits the cost; the pair shares one
  aligned session. Because a personal Pro/Max subscription can't power a hosted
  platform, the agent authenticates with a **platform-owned Anthropic API key**
  (Commercial Terms), admin-managed and encrypted at rest via `@praxis/crypto`
  (EPIC-05). The orchestrator fetches the active key and passes it as
  `ANTHROPIC_API_KEY` to the agent at spawn — never a subscription OAuth token.
  Per-project **usage metering + budgets** bound real spend (EPIC-05). The
  per-user Anthropic OAuth link (ADR-0006) is retained for future identity /
  bring-your-own-key, not inference.

## Where each subsystem lives in the repo

| Subsystem | Workspace | Status (post-EPIC-01) |
|---|---|---|
| Frontend (landing, dashboard, auth) | `apps/web` | **Live** — STORY-02, STORY-04 |
| Orchestrator (HTTP + WS) | `services/orchestrator` | **Live** — STORY-05 |
| Postgres schema + Drizzle client | `packages/db` | **Live** — STORY-03 |
| Sandbox interface + `DockerSandbox` | `packages/sandbox` | **Live** — STORY-07 |
| ACP host module (`claude-agent-acp` transport) | `packages/acp-host` | STORY-08 — see ADR-0009 |
| OAuth token encryption | `packages/crypto` | **Live** — STORY-06 |
| Admin area (role-gated) | `apps/web` | Future — STORY-20 |
| Platform API key storage (encrypted) | `packages/db`, `apps/web` | Future — STORY-21 |
| Usage metering + budgets | `packages/db`, `services/orchestrator`, `apps/web` | Future — STORY-22 / STORY-23 |
| Shared types | `packages/shared` | as needed |
| POC template | `templates/react-threejs-scene` | Future — STORY-14 |
| Reverse proxy config | `infrastructure/caddy` | **Live** — STORY-02 / STORY-05 |
| Sandbox base image | `infrastructure/docker` | Future — STORY-07 |
| systemd units + deploy scripts | `infrastructure/deploy` | **Live** — STORY-02 / STORY-03 / STORY-05 |
| MCP servers (image-gen) | `infrastructure/mcp-servers` | Future — STORY-15 |

## Read further

- `AGENTS.md` — agent-context: tier-1 universal rules, tier-2 project
  conventions, tier-3 tech-coupled rules + cross-cutting cookbook
  pointers.
- `docs/conventions/` — topic cookbooks split out of AGENTS.md tier-3:
  `deploy.md`, `database.md`, `auth-and-mail.md`.
- `docs/runbooks/` — per-deployable ops procedures: `deploy-web.md`,
  `deploy-postgres.md`, `deploy-orchestrator.md`.
- `docs/decisions/` — ADRs. Read these before changing anything an
  ADR touches; supersede via a new ADR rather than silent change.
- `docs/project_plan.md` — full engineering spec, data model,
  week-by-week POC roadmap, deferred work.
- `docs/executive_summary.md` — product context: who Praxis is for,
  what the six pillars are, what's in the POC vs the post-POC phase.
- `docs/development_strategy.md` — two-person async working agreement.
