# ARCHITECTURE.md — Praxis (local, single-user)

System shape for the local, single-user build. Everything runs on the
operator's machine via Docker Compose. There are no accounts, teams, or cloud
services; the agent runs on the operator's own `ANTHROPIC_API_KEY`.

## High-level shape

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (localhost)                                         │
│  ┌──────────────────┐                                       │
│  │ Next.js frontend │  http://localhost:3000                │
│  │ (apps/web)       │                                       │
│  └────────┬─────────┘                                       │
└───────────┼─────────────────────────────────────────────────┘
            │ HTTP + WebSocket (localhost:4001)
            ▼
   ┌──────────────────────────────────────────┐
   │  Orchestrator (Bun + Hono)               │  :4001
   │  - session WebSocket hub (per project)   │
   │  - ACP host (drives the agent)           │
   │  - sandbox lifecycle                     │
   │  - preview reverse proxy (*.preview.…)   │
   │  - chat/event log writer                 │
   └─────────┬──────────────────┬─────────────┘
             │ docker.sock       │
             ▼                   ▼
  ┌─────────────────────┐  ┌──────────────────────┐
  │ Docker container    │  │ Postgres 16          │
  │ per project         │  │                      │
  │ (praxis-net)        │  │ - users (one local)  │
  │                     │  │ - projects           │
  │ + Claude Code via   │  │ - sessions           │
  │   claude-agent-acp  │  │ - events             │
  │ + your API key      │  │ - mcp_usage          │
  │ + /workspace + .git │  │ - learning_links     │
  │ + dev server + MCP  │  │                      │
  └─────────────────────┘  └──────────────────────┘
```

All boxes are containers on the compose network `praxis-net`. The orchestrator
mounts the Docker socket and spawns per-project sandbox containers as siblings
on the same network, so it can reach each sandbox's dev server by container IP.

## Routing (no reverse proxy needed)

The orchestrator serves both the API and preview traffic on `:4001`,
distinguished by the request Host:

- `http://localhost:3000` → `apps/web` (Next.js)
- `http://localhost:4001` → orchestrator API + `/ws` WebSocket
- `http://<projectId>.preview.localhost:4001` → the project's sandbox dev server,
  reverse-proxied (with a Vite HMR WebSocket tunnel). Browsers resolve any
  `*.localhost` name to 127.0.0.1, so no DNS / hosts / TLS setup is needed.

## Core principles

- **Orchestrator owns active sessions.** WebSocket hub, ACP communication,
  sandbox lifecycle. Postgres is persistence, not coordination. A project has at
  most one live room; a page refresh reconnects within a grace window so the
  agent + conversation survive (STORY-35).
- **Agents speak ACP — Claude via an adapter.** `packages/acp-host` is an ACP host
  (JSON-RPC over stdio). Claude Code has no native ACP mode, so the sandbox runs
  the `@agentclientprotocol/claude-agent-acp` adapter as the ACP agent; native-ACP
  agents slot in behind the same `AcpHost` interface. See ADR-0009.
- **Sandboxes are Docker containers.** The `Sandbox` interface in
  `packages/sandbox` is abstract; another runtime (E2B, Firecracker, …) can slot
  in without touching consumers. Idle shutdown + resource limits are enforced.
- **Inference runs on the operator's own key.** The web app reads
  `ANTHROPIC_API_KEY` (and optional `OPENAI_API_KEY` for the image-gen MCP tool)
  from the environment and passes it to the agent in memory at spawn. Keys are
  never persisted or logged. (Upstream Praxis used an encrypted, admin-managed
  platform key; this fork drops that in favor of a local env var.)

## Where each subsystem lives

| Subsystem | Workspace |
|---|---|
| Frontend (dashboard, workspace UI) | `apps/web` |
| Orchestrator (HTTP + WS) | `services/orchestrator` |
| Postgres schema + Drizzle client + seed | `packages/db` |
| Sandbox interface + `DockerSandbox` | `packages/sandbox` |
| ACP host (`claude-agent-acp` transport) | `packages/acp-host` |
| Starter template | `templates/react-threejs-scene` |
| Sandbox base image | `infrastructure/docker/sandbox-base` |
| MCP servers (image-gen) | `infrastructure/mcp-servers` |
| Local runtime | `docker-compose.yml` |

## Read further

- `AGENTS.md` — agent-context and conventions.
- `docs/conventions/` — `database.md`, `orchestrator-runtime.md`.
- `docs/decisions/` — ADRs. Read the relevant one before changing anything it
  touches; supersede via a new ADR rather than a silent change.
