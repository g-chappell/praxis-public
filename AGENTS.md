# AGENTS.md — Praxis (local, single-user)

> Cross-tool agent-context file, read by Claude Code (via `CLAUDE.md` →
> `@AGENTS.md`), Codex, Cursor, Cline, Zed, Aider, and any other tool that
> follows the AGENTS.md convention.

## Project overview

Praxis (this fork) is a **local, single-user** workspace for building web apps
with an AI coding agent. One person picks a template, prompts the agent, and gets
a working app at a live preview URL with a git history that shows how it was
built. It runs entirely on the operator's machine via Docker — no accounts, no
teams, no cloud, no VPS. The agent runs on the operator's own `ANTHROPIC_API_KEY`.

Engineering centers on two abstractions that must stay swappable: the **ACP host
layer** (so any ACP-speaking agent plugs in) and the **Sandbox interface** (so
Docker can be swapped for another runtime without touching consumers).

See `ARCHITECTURE.md` for the system shape.

## Tech stack

- **Language:** TypeScript (strict)
- **Framework:** Next.js 14 App Router (`apps/web`) + Hono on Bun (`services/orchestrator`)
- **Runtime:** Node 20 for tools + web; Bun 1 for the orchestrator
- **Database:** Postgres 16 via Drizzle (schema-as-source-of-truth; `drizzle-kit push`)
- **Tests:** Vitest (unit + integration); Playwright (smoke e2e)
- **Lint + format:** Prettier 3 + ESLint 9 (flat config) — see ADR-0003
- **CI:** GitHub Actions
- **Run:** Docker Compose on the operator's machine

## Key commands

```bash
pnpm install
docker compose up -d db          # Postgres
pnpm db:push                     # create/sync schema on a fresh DB
pnpm db:seed                     # seed the single local user + learning links
pnpm dev                         # web (:3000) + orchestrator (:4001), hot reload
pnpm test                        # Vitest
pnpm -r --if-present typecheck   # tsc --noEmit across workspaces
pnpm lint                        # prettier --check && eslint
pnpm -r --if-present build       # production build
docker compose --profile build build sandbox-base   # build the sandbox image
docker compose up web orchestrator                  # run the full stack in Docker
```

## Workspace structure

```
apps/web                       Next.js frontend (dashboard, workspace UI)
services/orchestrator          Bun + Hono — WebSocket hub, ACP host driver, sandbox lifecycle
packages/db                    Postgres schema, Drizzle client, codegen'd types, seed
packages/sandbox               Sandbox interface + DockerSandbox implementation
packages/acp-host              ACP JSON-RPC host (spawn agent, stream events)
templates/react-threejs-scene  Starter template — Vite + React + @react-three/fiber + drei
infrastructure/docker          Sandbox base image Dockerfile
infrastructure/mcp-servers     MCP servers (image-gen)
docker-compose.yml             Local runtime: db + orchestrator + web + sandbox-base build
```

## Code style

- TypeScript strict; named exports (no default exports unless a framework requires one).
- Prettier 3 (`.prettierrc.json`): single quotes, trailing commas, 100-col width, semicolons.
- ESLint 9 flat config: `@eslint/js` recommended + `typescript-eslint` recommended.
- Trust internal code and framework guarantees. Only validate at system boundaries
  (user input, external APIs). Default to no comments; add one only when the *why*
  is non-obvious.

## Two sacred abstractions

The `Sandbox` interface (`packages/sandbox`) and the `AcpHost` layer
(`packages/acp-host`) exist so downstream choices stay reversible. Don't bypass
them or leak Docker / Anthropic specifics into consumers, and require an ADR
before changing their shape. ACP and MCP are load-bearing open standards — change
them only with an ADR.

## Never do

- Bypass the `Sandbox` interface or the `AcpHost` by importing Docker / Anthropic
  SDKs from consumer code — the abstractions exist so implementations can be swapped.
- Commit secrets (`.env`, API keys). `.env*` is gitignored and denied in
  `.claude/settings.json`. The operator's `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`
  are read from the environment, passed to the agent in memory, and **never**
  written to the DB or logged.
- Relax sandbox idle shutdown or resource limits without an ADR.
- Introduce security vulnerabilities (command injection, XSS, SQL injection, etc.).

> Note vs. upstream Praxis: this fork intentionally drops authentication, teams,
> the admin console, the encrypted platform-key store (`@praxis/crypto` /
> `@praxis/keys`), and all VPS deploy machinery. There is one seeded local user
> (`LOCAL_USER_ID` in `@praxis/db`); `apps/web/lib/current-user.ts` is the single
> point where real auth could slot back in.

## Conventions

Read the relevant cookbook before touching that layer:

- **`docs/conventions/database.md`** — Drizzle as source of truth, the two import
  surfaces (`@praxis/db` schema-only vs `@praxis/db/client` lazy proxy), lazy
  initialization for env-dependent modules, codegen drift check, no-mocking-the-DB.
  (This fork uses `drizzle-kit push` for local setup — no migration chain.)
- **`docs/conventions/orchestrator-runtime.md`** — the Bun↔dockerode rule
  (streaming ops use the docker CLI; unary lifecycle calls use dockerode —
  ADR-0010), sandbox networking, preview routing + the Vite HMR WebSocket tunnel
  (ADR-0015), and MCP-in-the-sandbox wiring (Path A: project `.mcp.json` +
  `enableAllProjectMcpServers`, ADR-0018).
- **`docs/decisions/`** — ADRs for decisions that cross component boundaries.
  Sequential numbering; Context / Decision / Consequences / Alternatives.
- **`ARCHITECTURE.md`** — system shape.

## Testing

- Unit tests with Vitest, colocated as `*.test.ts` next to the code.
- Integration tests for `packages/sandbox` / `packages/acp-host` run against a real
  Docker daemon, gated by `RUN_DOCKER_TESTS=1`.
- Persistence tests use a real Postgres, gated by `RUN_DB_TESTS=1` — no DB mocks.
- Smoke e2e with Playwright in `apps/web/e2e/`.
