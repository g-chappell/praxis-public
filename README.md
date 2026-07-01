# Praxis (local, single-user)

Build web apps by chatting with an AI coding agent — on your own machine, with
your own API key. Pick a template, prompt the agent, and watch a live preview
update as it writes the code. Every change is committed to git so you can see
how the app was built.

This is a local, single-user fork of Praxis: no accounts, no teams, no cloud —
just you and the agent. It runs entirely on your machine via Docker.

## How it works

- **apps/web** — Next.js UI: dashboard, and a workspace with a file tree, Monaco
  editor, live preview, git panel, and a chat panel that drives the agent.
- **services/orchestrator** — Bun + Hono. Owns the session lifecycle: starts a
  per-project Docker sandbox, runs the agent over the Agent Client Protocol (ACP),
  streams events to the browser, and reverse-proxies the sandbox's dev server as
  a live preview.
- **Sandboxes** — each project runs in its own Docker container (from
  `praxis-sandbox-base`) with a persistent `/workspace` volume, seeded from a
  template on first run. The agent (Claude Code, via the ACP adapter) runs inside
  it on your `ANTHROPIC_API_KEY`.

Two abstractions are kept deliberately swappable: the `Sandbox` interface
(`packages/sandbox`) and the `AcpHost` (`packages/acp-host`). See `ARCHITECTURE.md`.

## Requirements

- Docker (Desktop on macOS/Windows, or Engine on Linux)
- Node 20+ and [pnpm](https://pnpm.io) 9 (for the one-time DB setup and for
  running the app on the host during development)
- An [Anthropic API key](https://console.anthropic.com/)

## Quickstart

```bash
# 1. Configure — the only required value is ANTHROPIC_API_KEY.
cp .env.example .env
$EDITOR .env

# 2. Build the sandbox base image (once; ~a few minutes).
docker compose --profile build build sandbox-base

# 3. Install deps, create the database schema, and seed the local user.
pnpm install
docker compose up -d db
pnpm db:push
pnpm db:seed

# 4. Run the app.
docker compose up web orchestrator      # containerized
#   — or, for development with hot reload on the host:
#   pnpm dev
```

Then open **http://localhost:3000**. Create a project, prompt the agent, and open
the **Preview** tab — the running app is served at
`http://<projectId>.preview.localhost:4001` (browsers resolve any `*.localhost`
name to your machine, so no DNS or hosts-file setup is needed).

## Configuration

All configuration lives in `.env` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | **Required.** Powers the coding agent. |
| `OPENAI_API_KEY` | Optional. Enables the image-generation MCP tool. |
| `DATABASE_URL` | Postgres connection string. |
| `ORCHESTRATOR_INTERNAL_SECRET` | Shared secret for web → orchestrator calls. |
| `PREVIEW_DOMAIN` / `PREVIEW_SCHEME` / `PREVIEW_PORT` | Live-preview URL shape. |

Your API keys are read from the environment and passed to the agent in memory —
they are never written to the database or logged.

## Development

```bash
pnpm dev            # web (:3000) + orchestrator (:4001) with hot reload
pnpm test           # unit tests (Vitest)
pnpm typecheck      # tsc --noEmit across workspaces
pnpm lint           # prettier --check && eslint
pnpm build          # production build
```

Docker-backed integration tests for `packages/sandbox` and `packages/acp-host`
are gated behind `RUN_DOCKER_TESTS=1`.

## License

MIT — see `LICENSE`.
