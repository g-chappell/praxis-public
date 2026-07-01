<!-- DO NOT EDIT — this file is generated from roadmap/roadmap.yml -->
<!-- To add tasks: edit roadmap/roadmap.yml, then run `node roadmap/render.mjs` -->
<!-- Or run /roadmap-add or /pm-brainstorm from Claude Code. -->

# Praxis — Roadmap

_Created: 2026-05-31_

## Summary

- **Features verified:** 53 / 62 (85%)
- **Total tasks:** 196
- **Done:** 172 (88%)
- **Ready:** 24
- **In progress:** 0
- **Blocked:** 0

---

## EPIC-01 — Foundations

Week 1 of the POC. Monorepo scaffold with agent-friendly documentation,
the Next.js frontend Dockerised on this VPS behind Caddy, the Postgres
schema and migrations, magic-link auth, and the orchestrator skeleton.
By the end: a deployed landing page, a signed-in dashboard, and a
reachable /health on the orchestrator.

- **STORY-01** — Monorepo scaffold with agent-friendly docs and CI  [:white_check_mark: verified]
  > Initialise the pnpm workspaces monorepo and write the cross-tool
  > documentation files that ground every later session — AGENTS.md
  > (root + scoped), CLAUDE.md as a thin importer, ARCHITECTURE.md,
  > and the ADR template. Set up Biome + tsc + vitest and a CI
  > workflow that runs them on every PR.
  **Acceptance criteria:**
  - Fresh clone → `pnpm i && pnpm test` exits 0 (no tests yet is acceptable; the runner must be wired).
  - AGENTS.md, CLAUDE.md, ARCHITECTURE.md, and docs/decisions/0000-template.md are committed at repo root.
  - GitHub Actions `ci` workflow passes on a no-op PR and is set as a required check.
  **Out of scope:**
  - Per-workspace AGENTS.md (added as each workspace lands).
  - Production CI hardening (caching, matrix builds) — basic runner is enough.
  - :white_check_mark: **TASK-001** — Initialise pnpm workspaces with apps/ services/ packages/ templates/ infrastructure/  `high` `small`
    > Add root package.json (private, pnpm workspaces), pnpm-workspace.yaml
    > listing apps/*, services/*, packages/*, templates/*, infrastructure/*,
    > tsconfig.base.json with strict TypeScript, Biome config, root .gitignore
    > additions for Node/Next/Vite/TS build artefacts.
    _Task AC:_
    - `pnpm -v` resolves to >=8 in the repo root after install.
    - .gitignore covers node_modules, .next, dist, .turbo, .vite, *.tsbuildinfo.
  - :white_check_mark: **TASK-002** — Write AGENTS.md, CLAUDE.md, ARCHITECTURE.md grounded in /docs  `high` `small`  
    _depends on: TASK-001_
    > Root AGENTS.md ≤200 lines: one-line description, build/test commands,
    > code style summary, architecture paragraph, never-dos. CLAUDE.md is
    > two lines that @-import AGENTS.md and docs/conventions/claude-code-specific.md.
    > ARCHITECTURE.md mirrors project_plan.md §2 (high-level shape + core principles).
    _Task AC:_
    - AGENTS.md exists with all sections referenced in project_plan.md §3.
    - CLAUDE.md @imports resolve to existing files.
  - :white_check_mark: **TASK-003** — Add CI workflow (Biome + tsc + vitest) and pull_request_template.md  `high` `small`  
    _depends on: TASK-001_
    > .github/workflows/ci.yml runs `pnpm install --frozen-lockfile`,
    > `pnpm lint`, `pnpm typecheck`, `pnpm test --run`. Under 2 minutes
    > on a clean cache. Add .github/pull_request_template.md summarising
    > context, scope, and AC link.
    _Task AC:_
    - CI passes on a PR that touches only docs.
    - `ci` is set as a required check via .github/branch-protection.sh.
  - :white_check_mark: **TASK-004** :checkered_flag: — ADR template and first two ADRs (deployment + template choice)  `med` `small`  
    _depends on: TASK-002_
    > docs/decisions/0000-template.md (Context/Decision/Consequences/Alternatives).
    > ADR-0001: POC deploys entirely to a single VPS via Caddy + Docker;
    > Cloudflare Pages deferred. ADR-0002: React + Three.js (drei + fiber)
    > chosen as the POC template over React/Phaser; reason: easier visual
    > output from the image-gen MCP via textures.
    _Task AC:_
    - Both ADRs are written and committed; status=Accepted.
    - STORY-01 acceptance_criteria all satisfied.

- **STORY-02** — Next.js frontend Dockerised and deployed to this VPS via Caddy  [:white_check_mark: verified]
  > Scaffold apps/web (Next.js 14 App Router, shadcn/ui, Tailwind).
  > Produce a Docker image, run it as a systemd-managed service on the
  > VPS, and reverse-proxy it through Caddy at app.<domain>. Wire a
  > GitHub Actions deploy job that rebuilds and reloads on merge to main.
  **Acceptance criteria:**
  - https://app.<domain> serves a landing page with project name and a Sign in button (HTTPS via Caddy).
  - Merge to main triggers a deploy job that rebuilds the image and `systemctl reload` runs without dropping connections.
  **User flow:**
  1. Visitor hits app.<domain>
  2. Landing page renders project name, short pitch, Sign in button
  3. Sign in routes to /signin (implemented in STORY-04)
  **Out of scope:**
  - Cloudflare Pages migration (post-POC, see ADR-0001).
  - CDN / edge caching.
  - :white_check_mark: **TASK-005** — Scaffold apps/web with Next.js 14, shadcn/ui, Tailwind  `high` `medium` _(apps/web)_  
    _depends on: TASK-001_
    > Use create-next-app (App Router, TypeScript, Tailwind). Install
    > shadcn/ui with sensible defaults (slate base). Build the landing
    > page with the project name, a one-paragraph pitch from docs/
    > executive_summary.md, and a Sign in CTA that links to /signin.
    _Task AC:_
    - `pnpm --filter web dev` serves the landing page locally.
    - Tailwind classes apply correctly (verified by snapshot or e2e).
  - :white_check_mark: **TASK-006** — Dockerise apps/web with Next.js standalone output  `high` `small` _(apps/web)_  
    _depends on: TASK-005_
    > Add apps/web/Dockerfile producing a slim runtime image (node:20-alpine,
    > standalone output). Multi-stage build. Expose port 3000.
    _Task AC:_
    - `docker build` succeeds and the resulting container responds to GET / with 200.
  - :white_check_mark: **TASK-007** — Caddyfile and systemd unit for the web container  `high` `small` _(infrastructure/caddy, infrastructure/deploy)_  
    _depends on: TASK-006_
    > infrastructure/caddy/Caddyfile with `app.<domain>` block reverse-proxying
    > to 127.0.0.1:3000. infrastructure/deploy/praxis-web.service systemd
    > unit running `docker run` for the web image with restart=on-failure.
    > Document the install-on-VPS steps in docs/runbooks/deploy-web.md.
    _Task AC:_
    - Both files lint clean (`caddy validate`, `systemd-analyze verify`).
  - :white_check_mark: **TASK-008** :checkered_flag: — GitHub Actions deploy job → SSH → docker pull → systemctl reload  `high` `medium` _(infrastructure/deploy)_  
    _depends on: TASK-007_
    > .github/workflows/deploy-web.yml: triggers on push to main when
    > apps/web/** changes. Builds the image, pushes to GHCR, SSHs to
    > the VPS using a deploy key, pulls, runs `systemctl reload
    > praxis-web.service`. Smoke-tests https://app.<domain>.
    _Task AC:_
    - Deploy job green on a PR that bumps the landing page copy.
    - STORY-02 acceptance_criteria satisfied end-to-end.

- **STORY-03** — Postgres schema and migrations (POC subset)  [:white_check_mark: verified]
  > Stand up Postgres locally via docker-compose and on the VPS via a
  > systemd-managed container. Apply the 12 POC tables (plus 1 supporting index) from
  > project_plan.md §9 via a migration runner, and codegen TypeScript
  > types into packages/db so the rest of the codebase consumes a
  > single source of truth.
  **Acceptance criteria:**
  - `pnpm db:migrate` against a fresh Postgres creates all 12 POC tables plus the 1 supporting index idempotently.
  - `pnpm db:codegen` regenerates packages/db/types from the live schema; CI fails if the generated file is stale.
  **Out of scope:**
  - Skills, portfolio, subscriptions, admin tables (post-POC).
  - Connection pooling / pgbouncer.
  - :white_check_mark: **TASK-009** — Local Postgres via docker-compose; production Postgres systemd unit on VPS  `high` `small` _(infrastructure/deploy)_
    > infrastructure/deploy/docker-compose.dev.yml runs Postgres 16 +
    > MinIO for local dev. infrastructure/deploy/praxis-postgres.service
    > runs a Postgres container on the VPS with a persistent volume
    > and daily pg_dump backups.
    _Task AC:_
    - `docker compose up postgres` brings up a database reachable on 5432.
  - :white_check_mark: **TASK-010** — Migration runner with the 12 POC tables (plus supporting index)  `high` `medium` _(packages/db)_  
    _depends on: TASK-001, TASK-009_
    > Pick drizzle-kit or kysely-codegen — write packages/db with the
    > schema verbatim from project_plan.md §9 (users, auth_sessions,
    > magic_link_tokens, oauth_tokens, teams, team_memberships,
    > team_invites, projects, sessions, events, agent_turns,
    > learning_links). Add `pnpm db:migrate`.
    _Task AC:_
    - All 12 tables and the supporting index from §9 exist after `db:migrate`.
    - Re-running `db:migrate` is a no-op.
  - :white_check_mark: **TASK-011** :checkered_flag: — Codegen TypeScript types and a CI check for drift  `med` `small` _(packages/db)_  
    _depends on: TASK-010_
    > `pnpm db:codegen` emits packages/db/types.ts from the live schema.
    > CI runs codegen and fails if `git diff --exit-code` reports
    > uncommitted changes.
    _Task AC:_
    - Types are consumed by apps/web and services/orchestrator without manual definition.
    - STORY-03 acceptance_criteria satisfied.

- **STORY-04** — Magic-link auth via Better Auth  [:white_check_mark: verified]
  > Users sign in by submitting an email; the platform mails a one-time
  > link; clicking it creates a session and redirects to /dashboard.
  > No password, no MFA. Email sender behind an interface so dev mode
  > can stub it and production uses Resend (or SMTP).
  **Acceptance criteria:**
  - Submitting an email at /signin produces a `magic_link_tokens` row and an email (real or stubbed); clicking the link issues a session cookie and lands on /dashboard.
  - Expired/invalid tokens reject with a 4xx and a clear error page.
  **User flow:**
  1. User opens /signin
  2. Types email, submits
  3. Sees 'Check your email' confirmation
  4. Clicks magic link in email
  5. Lands on /dashboard signed in
  **Out of scope:**
  - Email/password sign-up, MFA, OAuth-only sign-in (later phases).
  - Account deletion UI.
  - :white_check_mark: **TASK-012** — Wire Better Auth with the Postgres adapter and a magic-link plugin  `high` `medium` _(apps/web, packages/db)_  
    _depends on: TASK-005, TASK-011_
    > Install Better Auth in apps/web. Use the schema from STORY-03 for
    > users / auth_sessions / magic_link_tokens. Add the magic-link
    > plugin with a configurable mailer.
    _Task AC:_
    - Better Auth routes mounted under /api/auth and respond 2xx where expected.
  - :white_check_mark: **TASK-013** — Mailer interface + Resend prod / stub dev  `high` `small` _(apps/web)_  
    _depends on: TASK-012_
    > packages/mailer or apps/web/lib/mailer.ts exposing send(email,subject,html).
    > Prod implementation uses Resend (RESEND_API_KEY). Dev implementation
    > logs to stdout and writes to .mail/ for local inspection.
    _Task AC:_
    - Local sign-in surfaces the link in .mail/ when no Resend key is configured.
  - :white_check_mark: **TASK-014** :checkered_flag: — Sign-in pages and protected /dashboard  `high` `medium` _(apps/web)_  
    _depends on: TASK-012, TASK-013_
    > /signin (email form), /verify (handles magic link), /dashboard
    > (placeholder, shows user email and a Sign out button). Server-side
    > session middleware redirects unauthenticated requests to /signin.
    _Task AC:_
    - End-to-end Playwright test: submit email → fetch link from .mail/ → visit → land on /dashboard.
    - STORY-04 acceptance_criteria satisfied.

- **STORY-05** — Orchestrator skeleton — Bun + Hono + WebSocket hub  [:white_check_mark: verified]
  > Scaffold services/orchestrator as a Bun + Hono process. Expose
  > /health (used by deploy + uptime checks) and /ws (the WebSocket
  > hub that later carries agent events, presence, prompts). Run it
  > as a systemd-managed Bun process on the VPS, fronted by Caddy
  > at api.<domain> (HTTPS, /ws upgrades to WSS).
  **Acceptance criteria:**
  - GET https://api.<domain>/health returns `{ ok: true, version }` with status 200.
  - A WebSocket client can connect to wss://api.<domain>/ws, send `{type:'ping'}`, and receive `{type:'pong'}` within 1s.
  **Out of scope:**
  - Per-project rooms, prompt queue, ACP host (STORY-08 and later).
  - Authentication on /ws — added when sessions land in STORY-09.
  - :white_check_mark: **TASK-015** — Scaffold services/orchestrator with Bun + Hono + Dockerfile  `high` `small` _(services/orchestrator)_  
    _depends on: TASK-001_
    > Bun init + Hono dependency. Add Dockerfile (oven/bun:1 base).
    > tsconfig with strict settings extending tsconfig.base.json.
    _Task AC:_
    - `bun run dev` starts the server locally on :4000.
  - :white_check_mark: **TASK-016** — /health + /ws ping/pong with structured logging  `high` `small` _(services/orchestrator)_  
    _depends on: TASK-015_
    > Hono routes for GET /health. Bun.serve websocket handler for /ws.
    > Pino-style JSON logging via Bun's console + a small lib.
    _Task AC:_
    - Integration test connects a WebSocket, sends ping, asserts pong.
  - :white_check_mark: **TASK-017** :checkered_flag: — Caddy block for api.<domain> + systemd unit  `high` `small` _(infrastructure/caddy, infrastructure/deploy)_  
    _depends on: TASK-016, TASK-007_
    > Add `api.<domain>` block to the Caddyfile reverse-proxying to
    > 127.0.0.1:4000 (handles /ws upgrade). Add
    > praxis-orchestrator.service running the Bun container with
    > restart=on-failure.
    _Task AC:_
    - Public /health returns 200 after deploy.
    - STORY-05 acceptance_criteria satisfied.

## EPIC-02 — Agent integration

Week 2. Anthropic OAuth so users connect their own subscription, the
Sandbox abstraction with a Docker implementation, the ACP host that
speaks to Claude Code over JSON-RPC, and the first end-to-end
hello-world session that joins all three.

- **STORY-06** — Anthropic OAuth flow with encrypted token storage  [:white_check_mark: verified]
  > A signed-in user clicks "Connect to Claude Code" on /settings, completes
  > OAuth, and the platform stores access + refresh tokens encrypted
  > in oauth_tokens. On agent invocation, the orchestrator retrieves
  > the prompting user's token, refreshes if needed, and passes it
  > to Claude Code via environment.
  **Acceptance criteria:**
  - After connecting, a row exists in oauth_tokens with encrypted access/refresh tokens; decrypting yields valid tokens.
  - When the access token is within 60s of expiry, a refresh is performed automatically before any agent spawn.
  **User flow:**
  1. User goes to /settings
  2. Clicks 'Connect to Claude Code'
  3. Redirected to Anthropic OAuth
  4. Consents to scopes
  5. Redirected back to /settings showing 'Connected to Claude Code ✓'
  **Out of scope:**
  - OpenAI OAuth (next phase, alongside Codex).
  - Per-team token sharing.
  - :white_check_mark: **TASK-018** — Anthropic OAuth client + /api/oauth/anthropic/{authorize,callback}  `high` `medium` _(apps/web)_  
    _depends on: TASK-014_
    > Register a platform OAuth client with Anthropic (manual, captured
    > in docs/runbooks/anthropic-oauth.md). Implement state-cookie CSRF
    > protection, code exchange, and persistence into oauth_tokens.
    _Task AC:_
    - Round-trip from /settings → consent → /settings produces a row in oauth_tokens for the signed-in user.
  - :white_check_mark: **TASK-019** — Token encryption at rest  `high` `medium` _(packages/crypto, apps/web)_  
    _depends on: TASK-018_
    > packages/crypto: libsodium-based encrypt/decrypt using a 32-byte
    > key derived from PRAXIS_MASTER_KEY env. Document key rotation
    > in docs/runbooks/key-rotation.md.
    _Task AC:_
    - Round-trip encrypt → store → fetch → decrypt yields the original token.
  - :white_check_mark: **TASK-020** :checkered_flag: — Refresh-on-expiry + 'Connected to Anthropic' UI  `high` `small` _(apps/web, services/orchestrator)_  
    _depends on: TASK-019_
    > Shared helper: getValidAnthropicToken(userId) refreshes if
    > expires_at < now+60s. Settings page shows connection status,
    > with Disconnect action that nulls the row.
    _Task AC:_
    - Forcing expires_at into the past triggers a successful refresh before the next agent spawn.
    - STORY-06 acceptance_criteria satisfied.

- **STORY-07** — Sandbox interface + DockerSandbox implementation  [:white_check_mark: verified]
  > Define the Sandbox interface from project_plan.md §6 in
  > packages/sandbox so consumers depend on the abstraction, not on
  > Docker. Implement DockerSandbox via dockerode against a base
  > image with Node 20, Claude Code CLI, git, and common build tools.
  > Idle shutdown after 30 minutes; resource limits per §6.
  **Acceptance criteria:**
  - Integration tests cover start/exec/spawn/writeFile/readFile/watchFiles/exposePort/stop against a real Docker daemon and pass in CI.
  - After 30 minutes of no exec/spawn activity, the container is stopped automatically; the next start() restores from object storage (stubbed in tests).
  **Out of scope:**
  - E2B, Firecracker, Daytona implementations (later phases).
  - Per-template sandbox base images (handled in STORY-14).
  - :white_check_mark: **TASK-021** — packages/sandbox: define the Sandbox TypeScript interface  `high` `small` _(packages/sandbox)_  
    _depends on: TASK-001_
    > Copy the interface from project_plan.md §6 verbatim. Add
    > SandboxHandle, ExecOptions, ExecResult, SpawnOptions,
    > ProcessHandle, FileEvent, Unsubscribe types.
    _Task AC:_
    - Interface compiles with no `any`; exported from package index.
  - :white_check_mark: **TASK-022** — DockerSandbox via dockerode + base image  `high` `large` _(packages/sandbox, infrastructure/docker)_  
    _depends on: TASK-021_
    > infrastructure/docker/sandbox-base/Dockerfile based on node:20-bookworm
    > with claude-code CLI, git, build-essential, python3. DockerSandbox
    > class implements every method. Resource limits via HostConfig
    > (Memory 2g, CpuQuota for 1 CPU, StorageOpt 5g).
    _Task AC:_
    - All Sandbox methods have integration tests against the real Docker daemon and pass.
  - :white_check_mark: **TASK-023** :checkered_flag: — Idle-shutdown daemon + state persistence to MinIO  `high` `medium` _(packages/sandbox, services/orchestrator)_  
    _depends on: TASK-022_
    > Track last activity per sandbox; cron-style sweep every minute
    > stops idle ones. On stop, tar the project volume and PUT to
    > MinIO (bucket per project). On start with existing snapshot,
    > restore before returning the handle.
    _Task AC:_
    - End-to-end test: write file, force idle, observe stop, start, file is present.
    - STORY-07 acceptance_criteria satisfied.

- **STORY-08** — ACP host module in packages/acp-host  [:white_check_mark: verified]
  > Implement the ACP host code in packages/acp-host. Given a sandbox
  > handle and an Anthropic OAuth token, it spawns Claude Code inside
  > the sandbox, negotiates the ACP session over stdio, and exposes
  > prompt(text, attribution) returning an async iterator of
  > ACP events (text chunks, tool calls, file changes).
  **Acceptance criteria:**
  - Given a running sandbox and a valid token, prompt('hello') yields at least one text-chunk event and completes without error.
  - Tool-permission events surface to the caller for approval; denial cancels the turn cleanly.
  **Out of scope:**
  - Multi-user attribution (handled at the orchestrator layer in STORY-12).
  - Codex support (next phase).
  - :white_check_mark: **TASK-024** — Pick an OSS ACP client lib (or write a minimal one)  `high` `small` _(packages/acp-host)_  
    _depends on: TASK-001_
    > Evaluate published Node ACP libraries. Pick one or implement a
    > ~300-line JSON-RPC stdio client covering initialize, prompt,
    > session/update, request_permission, complete, shutdown.
    > Record the decision as ADR-0009.
    _Task AC:_
    - Choice recorded in docs/decisions/0009-*.md with Consequences and Alternatives.
  - :white_check_mark: **TASK-025** — AcpHost.spawnAndPrompt(sandbox, token, prompt) → AsyncIterable<AcpEvent>  `high` `large` _(packages/acp-host)_  
    _depends on: TASK-021, TASK-024_
    > Spawn `claude-code --acp` inside the sandbox via Sandbox.spawn.
    > Pipe stdin/stdout JSON-RPC. Emit typed events for each ACP
    > session/update kind. Forward request_permission to a callback.
    _Task AC:_
    - Unit tests cover happy-path prompt, tool-permission, and shutdown.
  - :white_check_mark: **TASK-026** :checkered_flag: — End-to-end integration test: prompt round-trip in a real sandbox  `high` `medium` _(packages/acp-host, packages/sandbox)_  
    _depends on: TASK-025, TASK-022_
    > CI job that starts a DockerSandbox, runs AcpHost.spawnAndPrompt
    > with a test token, and asserts a streamed text response within
    > 30s. Skipped on PRs that don't touch acp-host or sandbox.
    _Task AC:_
    - Integration test passes in CI on a clean build.
    - STORY-08 acceptance_criteria satisfied.

- **STORY-09** — End-to-end hello-world session  [:white_check_mark: verified]
  > Tie it all together. A signed-in user creates a project, the
  > orchestrator starts a DockerSandbox, ACP host spins up Claude
  > Code, and the user's first prompt streams back to the browser
  > over WebSocket. On session stop, the project state captures to
  > MinIO; next session resume restores it.
  **Acceptance criteria:**
  - From a fresh dashboard: 'New project' → container starts → prompt 'say hello' → assistant response streams in chat panel within 10s.
  - Closing the session then re-opening the project restores file state (a marker file written during the first session is present in the second).
  **User flow:**
  1. Signed-in user on /dashboard
  2. Clicks 'New project'
  3. Picks the (single) react-threejs-scene template
  4. Lands on /projects/<id> with the three-panel workspace
  5. Types 'say hello' in the prompt panel
  6. Sees assistant response stream in the chat panel
  **Out of scope:**
  - Two-user simultaneous session (STORY-12).
  - Preview URL (STORY-13).
  - :white_check_mark: **TASK-027** — Orchestrator: createSession + WebSocket session room  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-017, TASK-023, TASK-025, TASK-058, TASK-059_
    > POST /sessions { projectId } creates a row in `sessions`, starts
    > a sandbox, spawns ACP, registers a WebSocket room. Clients in
    > the room receive agent_event messages broadcast from ACP.
    > Authenticates the agent with the active platform Anthropic API key
    > (getActivePlatformKey, STORY-21) passed as ANTHROPIC_API_KEY per
    > ADR-0009 — never an OAuth token. Hence the dependency on the admin
    > key management (STORY-20/21) landing first.
    _Task AC:_
    - Postman/integration test creates a session and receives at least one agent_event.
  - :white_check_mark: **TASK-028** — Frontend: New project flow + minimal chat panel  `high` `medium` _(apps/web)_  
    _depends on: TASK-014, TASK-027_
    > /dashboard 'New project' button → POST /projects → /projects/<id>
    > page that opens the WebSocket, sends prompts, renders streamed
    > agent events. No file tree / Monaco yet (that's STORY-10).
    _Task AC:_
    - Manual test: prompt 'say hello' streams a response in the chat panel.
  - :white_check_mark: **TASK-029** :checkered_flag: — State capture/restore via MinIO  `high` `medium` _(services/orchestrator, packages/sandbox)_  
    _depends on: TASK-027, TASK-023_
    > On session stop, tarball the project volume and PUT to MinIO
    > (bucket: praxis-project-state, key: <projectId>.tar.gz). On
    > next start, GET and untar before ACP spawn. Skip if no snapshot.
    _Task AC:_
    - Integration test: write marker file, stop session, restart, marker present.
    - STORY-09 acceptance_criteria satisfied.

- **STORY-19** — Sandbox outbound network egress allowlist  [:white_check_mark: verified]
  > Restrict sandbox containers to an outbound allowlist (Anthropic API,
  > OpenAI API, npm, PyPI, GitHub read-only) with no inbound except the
  > exposed preview port, per project_plan.md §6. Deferred from STORY-07,
  > whose acceptance criteria covered the Sandbox interface, DockerSandbox,
  > and idle/persistence but not network policy.
  **Acceptance criteria:**
  - A sandbox container can reach api.anthropic.com and registry.npmjs.org but not an arbitrary disallowed host.
  - No inbound connections succeed except the port published via exposePort.
  **Out of scope:**
  - Per-user / per-template network policy (a single allowlist for the POC).
  - :white_check_mark: **TASK-053** :checkered_flag: — Egress allowlist for sandbox containers  `med` `medium` _(packages/sandbox, infrastructure/docker)_ · [PR](https://github.com/g-chappell/praxis/pull/391)  
    _depends on: TASK-022_
    > Enforce an outbound allowlist on DockerSandbox containers (filtered
    > Docker network / egress proxy / firewall sidecar). Block all inbound
    > except the port published via exposePort. Document the policy and
    > how to extend the allowlist.
    _Task AC:_
    - Integration test: allowed host reachable, disallowed host blocked, from inside a sandbox.
    - STORY-19 acceptance_criteria satisfied.

## EPIC-03 — Workspace UI

Week 3. The collaborative three-panel surface: file tree + Monaco +
chat/prompt, real-time sync between two users with presence, cursors,
and file-level locks, a prompt queue with attribution, and preview
URLs surfaced through a wildcard Caddy domain.

- **STORY-10** — Three-panel workspace shell  [:white_check_mark: verified]
  > The IDE-like layout users live in. Left: file tree from the
  > sandbox over WebSocket. Centre: Monaco loading whichever file
  > is clicked. Right: chat/prompt panel from STORY-09 expanded
  > with attribution and message types.
  **Acceptance criteria:**
  - Opening a project renders all three panels; the file tree mirrors the sandbox; clicking a file loads it in Monaco within 500ms.
  - Edits in Monaco persist to the sandbox over the WebSocket and reload correctly after a page refresh.
  **User flow:**
  1. User opens /projects/<id>
  2. Three panels render: file tree, editor, chat
  3. Clicks a file → contents load in Monaco
  4. Edits and saves → file persists in the sandbox
  **Out of scope:**
  - Yjs co-editing (post-POC).
  - Multi-cursor presence (STORY-11).
  - :white_check_mark: **TASK-030** — Workspace layout components + resizable panels  `high` `medium` _(apps/web)_  
    _depends on: TASK-028_
    > apps/web/components/Workspace with a 3-pane react-resizable-panels
    > layout. Persists pane sizes per-user in localStorage.
    _Task AC:_
    - Resizing a pane survives a page refresh.
  - :white_check_mark: **TASK-031** — File tree fed by sandbox watchFiles; Monaco loader  `high` `large` _(apps/web, services/orchestrator)_  
    _depends on: TASK-030, TASK-023_
    > Orchestrator forwards Sandbox.watchFiles events to the WebSocket
    > room as file_changed messages. Client builds a tree, requests
    > file contents via WS request, loads into Monaco. Save action
    > sends edit message → orchestrator writeFile → sandbox.
    _Task AC:_
    - Edit-save-refresh cycle preserves content.
  - :white_check_mark: **TASK-032** :checkered_flag: — Chat panel: typed message kinds + per-user attribution UI  `high` `small` _(apps/web)_  
    _depends on: TASK-030_
    > Render agent_event messages with kinds: text_chunk, tool_call,
    > file_change_notice, error. Each message shows the prompting
    > user's avatar+name. Prompt input shows the current user.
    _Task AC:_
    - Snapshot test of the chat panel rendering each message kind.
    - STORY-10 acceptance_criteria satisfied.

- **STORY-11** — Presence, cursors, and file-level locks  [:white_check_mark: verified]
  > Two browsers in the same project see each other. Per-user cursors
  > show in Monaco when both users have the same file open. Opening
  > a file acquires a soft lock — the other user can see the file but
  > can't edit until the lock is released.
  **Acceptance criteria:**
  - Two browser sessions in the same project display each other in a presence list with avatar + name.
  - When user A opens file X, user B sees a lock indicator on file X and Monaco for X is read-only for B.
  **User flow:**
  1. User A and User B both open the same project
  2. Both see each other in the presence list
  3. User A clicks file X — file X is locked by A
  4. User B clicks file X — Monaco loads in read-only mode with 'Locked by A' header
  5. User A closes file X — lock releases, B's editor becomes editable
  **Out of scope:**
  - Character-level co-editing via Yjs (post-POC).
  - Follow mode (post-POC).
  - :white_check_mark: **TASK-033** — Presence + cursor messages and UI overlays  `high` `medium` _(apps/web, services/orchestrator)_  
    _depends on: TASK-031_
    > presence (join/leave/heartbeat) and cursor messages over WS.
    > Presence list in the workspace header; cursor overlays in
    > Monaco using monaco-editor decorations API.
    _Task AC:_
    - Two tabs in two windows see each other's cursor positions live.
  - :white_check_mark: **TASK-034** :checkered_flag: — File-lock acquire/release + read-only Monaco when locked  `high` `medium` _(apps/web, services/orchestrator)_  
    _depends on: TASK-033_
    > Orchestrator tracks file_locks per project room. file_lock
    > and file_unlock messages over WS. Client marks Monaco
    > read-only and shows lock owner in the file tree.
    _Task AC:_
    - Race test: simultaneous lock requests resolve deterministically (first writer wins).
    - STORY-11 acceptance_criteria satisfied.

- **STORY-12** — Prompt queue with two-user attribution  [:white_check_mark: verified]
  > SUPERSEDED by STORY-34 (prompt-control modes, #230) — its serialised
  > mode delivered the per-project FIFO queue + per-user attribution + the
  > visible queue UI. Closed without separate implementation; tasks point
  > at #230. Original scope below.
  > 
  > Both users in a project can submit prompts. Only one turn runs at
  > a time. Other prompts queue with visible position. The agent's
  > response is attributed to the user who prompted, in the chat
  > panel, in the agent_turns row, and in git commit metadata.
  **Acceptance criteria:**
  - If user A submits a prompt while user B's prompt is mid-turn, user A's prompt shows queue_position=1 until B's turn completes, then runs.
  - After completion, agent_turns row has prompting_user_id set; chat panel attributes the response to the prompter.
  **User flow:**
  1. User A submits 'do X' while User B is mid-turn
  2. User A sees 'queue position: 1' on their message
  3. User B's turn completes
  4. User A's prompt runs; response attributed to A
  **Out of scope:**
  - Cross-project queuing.
  - Priority levels / preemption.
  - :white_check_mark: **TASK-035** — Orchestrator FIFO queue per project + ACP attribution wrap  `high` `medium` _(services/orchestrator, packages/acp-host)_ · [PR](https://github.com/g-chappell/praxis/pull/230)  
    _depends on: TASK-027_
    > Per-project queue of pending prompts. Each prompt wrapped with
    > an attribution header (invisible to the agent) before being
    > sent over ACP. agent_turns row created at enqueue, completed
    > after stream end.
    _Task AC:_
    - Integration test queues 3 prompts and confirms strict FIFO ordering.
  - :white_check_mark: **TASK-036** :checkered_flag: — Frontend: queue position UI + attribution in chat  `high` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/230)  
    _depends on: TASK-035, TASK-032_
    > Show queue_position on the user's own pending message. When
    > a turn starts, swap to 'thinking…'. Chat messages show the
    > prompter's avatar + name.
    _Task AC:_
    - Manual two-browser test: A's prompt queues behind B's, runs after, both attributed correctly.
    - STORY-12 acceptance_criteria satisfied.

- **STORY-13** — Preview URL via Caddy wildcard  [:white_check_mark: verified]
  > When a project's app starts (e.g. Vite on :5173 in the sandbox),
  > the orchestrator allocates a unique subdomain
  > <projectSlug>.preview.<domain> and registers it with Caddy
  > on-demand so it routes to the right sandbox port. URL is revoked
  > when the sandbox stops.
  **Acceptance criteria:**
  - Calling Sandbox.exposePort(handle, 5173) returns an https URL that fetches the sandbox's port content within 1s.
  - After Sandbox.stop(), the URL returns 502/404 (Caddy upstream gone).
  **Out of scope:**
  - Persistent preview URLs across sessions (Plus tier, productisation).
  - Custom user domains.
  - :white_check_mark: **TASK-037** — Caddy on-demand TLS for *.preview.<domain>  `high` `medium` _(infrastructure/caddy)_  
    _depends on: TASK-007, TASK-027_
    > Wildcard Caddy block with on_demand TLS and an ask endpoint
    > that the orchestrator answers (returns 200 iff the subdomain
    > maps to a live sandbox).
    _Task AC:_
    - Caddy validates and obtains a wildcard cert for the placeholder domain.
  - :white_check_mark: **TASK-038** :checkered_flag: — Sandbox.exposePort → Caddy upstream registration  `high` `medium` _(packages/sandbox, services/orchestrator)_  
    _depends on: TASK-037, TASK-022_
    > exposePort returns the URL after writing a mapping in an
    > orchestrator-local store. /caddy/ask reads the store. On
    > Sandbox.stop, mapping removed and Caddy reloaded (or just
    > dropped from the ask endpoint).
    _Task AC:_
    - Integration test: expose port serving 'hello', curl URL returns 'hello'; stop, curl returns 5xx.
    - STORY-13 acceptance_criteria satisfied.

- **STORY-25** — Persist + replay chat transcript across reconnect  [:white_check_mark: verified]
  > SUPERSEDED by STORY-37 (persistent chat history, #228) — it persists
  > the transcript (events table) and replays it, attributed, on every
  > (re)join, which is this Story's AC. Closed without separate
  > implementation; tasks point at #228. Original scope below.
  > 
  > Today a page reload restores the sandbox FILE state (MinIO,
  > ADR-0008) but the chat history is empty — the agent_turns table
  > exists in packages/db (prompt_text, response_text,
  > prompting_user_id, session_id, started_at, completed_at) yet is
  > never written or read. Wire it: persist each prompt turn as it
  > happens, and hydrate the chat panel from agent_turns when a user
  > re-opens the workspace, preserving each message's original
  > per-user attribution.
  **Acceptance criteria:**
  - Prompting then reloading the workspace shows the prior prompts and agent responses in the chat panel.
  - Each restored message keeps its prompting-user attribution (avatar + name).
  **User flow:**
  1. User prompts the agent and gets a response
  2. User reloads the page (or re-opens the project later)
  3. The chat panel shows the prior prompts + responses, attributed to who sent them
  **Out of scope:**
  - Agent/Claude conversation-context continuity across sessions (the model re-reading its own prior turns) — transcript display only.
  - Live multi-user presence and cursors (STORY-11).
  - :white_check_mark: **TASK-067** — Orchestrator: persist an agent_turns row per prompt turn  `high` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/228)  
    _depends on: TASK-032_
    > On a prompt, insert an agent_turns row (project_id, session_id,
    > prompting_user_id, prompt_text, started_at). On the
    > turn-complete AcpEvent, update response_text + completed_at for
    > that turn. Best-effort: a persistence failure must not break the
    > live stream.
    _Task AC:_
    - After a prompt turn completes, an agent_turns row exists with the prompt text, response text, prompting user, and completed_at set.
  - :white_check_mark: **TASK-068** :checkered_flag: — Hydrate chat panel from agent_turns on reconnect  `high` `medium` _(apps/web, services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/228)  
    _depends on: TASK-067_
    > On workspace open, fetch the project's prior agent_turns
    > (ordered by started_at) and render them in the chat panel as
    > user_message + agent response pairs, each tagged with the
    > original prompting user's avatar + name, before/alongside the
    > live socket stream.
    _Task AC:_
    - Reloading a workspace that had prior turns renders those turns in the chat panel with correct per-user attribution.
    - STORY-25 acceptance_criteria satisfied.

- **STORY-30** — Live-reload the preview pane (proxy Vite HMR WebSocket)  [:white_check_mark: verified]
  > Follow-up to STORY-13/14. The orchestrator preview proxy (ADR-0015)
  > forwards plain HTTP only, so Vite's HMR WebSocket never connects
  > through <slug>.preview.<domain> — the preview renders but updates
  > only on a MANUAL refresh, not live as the agent edits files
  > (operator-confirmed live 2026-06-03, "preview updated after refresh").
  > Tunnel the HMR WebSocket upgrade through the preview proxy to the
  > sandbox dev server so the preview hot-reloads automatically.
  **Acceptance criteria:**
  - The orchestrator preview proxy forwards WebSocket upgrade requests (Vite's HMR ws endpoint) through to the sandbox dev server, so the Vite HMR client connects successfully through https://<slug>.preview.<domain>.
  - Editing a file in a running react-threejs-scene project hot-reloads (or full-reloads) the preview pane automatically with no manual refresh — verified live on the VPS.
  - Non-preview and non-upgrade requests are unaffected: the existing HTTP preview proxy and the session WebSocket keep working.
  **User flow:**
  1. User opens a 3js project's preview pane
  2. User asks the agent to change the scene (or edits a file in Monaco)
  3. The preview updates automatically within a second or two, without a manual refresh
  **Out of scope:**
  - HMR for templates other than react-threejs-scene (the mechanism should generalise, but only the 3js template is in scope to verify).
  - Collaborative multi-user cursor/edit sync (post-POC, Yjs).
  - :white_check_mark: **TASK-079** — Orchestrator: tunnel the preview WebSocket upgrade to the sandbox dev server  `med` `medium` _(services/orchestrator)_  
    _depends on: TASK-038_
    > In the preview proxy, detect a WebSocket upgrade on a
    > preview-host request and tunnel it to the sandbox dev server
    > (ip:port from the PreviewRegistry), bidirectionally piping
    > frames. Keep the existing HTTP proxy path for non-upgrade
    > requests untouched.
    _Task AC:_
    - A WebSocket upgrade to a live preview host is proxied to the sandbox dev server and frames pass both ways; a non-upgrade request still serves over the HTTP path.
  - :white_check_mark: **TASK-080** :checkered_flag: — Verify preview hot-reload live + document Vite HMR config  `med` `small` _(services/orchestrator, templates/react-threejs-scene)_  
    _depends on: TASK-079_
    > On the VPS, edit a file in a running 3js project and confirm the
    > preview pane hot-reloads without a manual refresh. Capture any
    > Vite config the proxied setup needs (e.g. server.hmr.clientPort,
    > allowedHosts) in the template and in
    > docs/conventions/orchestrator-runtime.md.
    _Task AC:_
    - Live on the VPS: editing a file in a running 3js project reloads the preview pane with no manual refresh.
    - STORY-30 acceptance_criteria satisfied.

- **STORY-31** — Share a project via invite link  [:white_check_mark: verified]
  > A project owner generates a single-use, 7-day invite link from the
  > workspace header. Whoever opens it (signing in via magic-link if
  > needed) joins the project's team and lands in the shared workspace.
  > Built on the existing team_invites table (inviteCode + expiresAt +
  > acceptedBy) — no schema change; access is team-scoped, matching
  > userOwnsProject(). This is the on-ramp that makes STORY-11's
  > presence / cursors / locks usable by two real people.
  **Acceptance criteria:**
  - From the workspace header, the owner can generate a copyable invite link encoding a single-use code valid for 7 days.
  - A signed-out person opening a valid link is routed through magic-link sign-in and, on return, is added to the project's team and lands in the shared project's workspace.
  - A signed-in non-member opening a valid link joins the team and lands in the shared workspace; an existing member just lands in the workspace with no duplicate membership.
  - An expired, invalid, or already-used link shows a friendly error page naming the reason, makes no team change, and offers a path back to the dashboard.
  - After a second user joins, both users appear in the same project's STORY-11 presence list (verified live).
  **User flow:**
  1. Owner is in the project workspace → clicks 'Invite' in the header
  2. A panel reveals a copyable /invite/<code> link with an 'expires in 7 days' note → owner copies and sends it out-of-band
  3. Invitee (signed out) opens the link → redirected to /signin?next=/invite/<code> → enters email → opens the magic-link email → returns to /invite/<code>
  4. System adds them to the team and redirects into the shared project's workspace
  5. Invitee (already signed in) opens the link → joined immediately → lands in the workspace
  6. Both users now see each other in the presence list (STORY-11)
  **Out of scope:**
  - Email-address-targeted invites (sending the link via email from the app).
  - Revoking, listing, or early-expiring invites; viewing/removing team members.
  - Reusable (multi-acceptor) links — single acceptedBy keeps it single-use.
  - Per-project ACLs — access is team-scoped.
  - Roles/permissions — all team members are equal (no viewer/editor split).
  - Rate-limiting / abuse protection on invite creation.
  - :white_check_mark: **TASK-081** — lib + API: create + accept invite (ownership-checked, single-use, 7-day TTL)  `high` `medium` _(apps/web)_
    > lib/invites.ts:
    > - createInvite(userId, projectId) — ownership-checked via
    >   userOwnsProject; insert team_invites {teamId: project.teamId,
    >   inviteCode: <url-safe random>, expiresAt: now+7d}; return
    >   {code, expiresAt}. Reject (403) when the caller isn't a team member.
    > - acceptInvite(userId, code) — look up by inviteCode and return a
    >   discriminated result: 'invalid' (no row) | 'expired'
    >   (expiresAt<now) | 'used' (acceptedBy set & != userId) | 'ok'.
    >   On 'ok' for a non-member: insert one team_membership + stamp
    >   acceptedBy. Idempotent when already a member (no write). Resolve
    >   the landing project as the team's newest project; return
    >   {status, teamId, projectId|null, alreadyMember}.
    > Routes: POST /api/projects/[id]/invites (401/403/200
    > {code,url,expiresAt}); POST /api/invites/[code]/accept (401 unauth,
    > else the status shape). Boundary validation only; team_invites
    > already exists (no migration).
    _Task AC:_
    - createInvite returns a unique url-safe code + expiresAt ~7 days out; 403 when the caller isn't a member of the project's team.
    - acceptInvite inserts exactly one team_membership and stamps acceptedBy for a valid unused code; no duplicate membership when already a member.
    - acceptInvite returns 'invalid' / 'expired' / 'used' with no DB write in those cases.
    - POST /api/projects/[id]/invites -> 401 unauth, 403 non-owner, 200 {code,url,expiresAt}.
  - :white_check_mark: **TASK-082** — Owner UI: Invite button + copyable link in the workspace header  `high` `small` _(apps/web)_  
    _depends on: TASK-081_
    > Add an "Invite" button (testid workspace-invite-button) to the
    > project workspace header (near the STORY-11 presence bar). On
    > click, POST /api/projects/[id]/invites and reveal the returned
    > absolute /invite/<code> URL in a read-only field (testid
    > invite-link-input) with an "expires in 7 days" note and a copy
    > button (testid invite-copy-button) that writes the URL to the
    > clipboard and confirms ("Copied"). Handle the request error state
    > inline.
    _Task AC:_
    - Clicking workspace-invite-button POSTs to the create endpoint and shows the /invite/<code> URL in invite-link-input.
    - invite-copy-button copies the full URL to the clipboard and confirms via a label change.
    - An 'expires in 7 days' note is shown beside the link.
  - :white_check_mark: **TASK-083** — Invitee accept route /invite/[code] + sign-in callback round-trip  `high` `medium` _(apps/web)_  
    _depends on: TASK-081_
    > Route /invite/[code] (kept OUT of the middleware matcher so it's
    > publicly reachable). Signed-in -> call acceptInvite; on 'ok'
    > redirect to /projects/<projectId> (or /dashboard when null);
    > already-member redirects straight in. Signed-out -> redirect to
    > /signin?next=/invite/<code>. Update SignInForm to read the `next`
    > param and pass it as the magic-link callbackURL (fallback
    > /dashboard), so verification returns to the accept route.
    > 'invalid'/'expired'/'used' -> render an error page (testid
    > invite-error) naming the reason with a dashboard link (testid
    > invite-error-dashboard-link); no membership created.
    _Task AC:_
    - Signed-in visit to /invite/<valid> joins the team and redirects to the shared project workspace.
    - Signed-out visit redirects to /signin?next=/invite/<code>; SignInForm uses `next` as the magic-link callbackURL (else /dashboard).
    - Expired/invalid/used code renders invite-error with the reason + invite-error-dashboard-link; no membership written.
    - An already-member visiting the link is redirected into the workspace with no duplicate membership.
  - :white_check_mark: **TASK-084** :checkered_flag: — Verify: second account accepts an invite and joins the live project  `high` `small` _(apps/web)_  
    _depends on: TASK-082, TASK-083_
    > Automated gate: integration test of acceptInvite (non-member
    > joins; already-member no-op; expired/used produce no write) plus
    > the accept route's redirect target. Where feasible, a Playwright
    > pass where a second account opens the captured link, signs in via
    > the dev mailer, and is redirected into the shared project. The
    > full "both users in the presence list" check is multiplayer/live —
    > verified on the VPS post-deploy (per the deploy-layer-live
    > convention), not asserted in CI.
    _Task AC:_
    - Integration test: acceptInvite adds the second user to the team and the accept route resolves to the shared project.
    - A used/expired link yields the error path with no membership change.
    - Manual VPS check recorded: both users appear in the project's presence list after the invite is accepted.

- **STORY-32** — Shared project room: cross-user presence and chat  [:white_check_mark: verified]
  > Two users in the same project must join ONE live session room, not
  > separate ones. Today POST /sessions unconditionally inserts a new
  > sessions row and createRoom(sessionId) per connection, while the
  > sandbox container is per-project (praxis-sandbox-<projectId>) and
  > reused — so two users share files but sit in separate rooms, seeing
  > only themselves in presence and never each other's chat/cursors/locks.
  > Additionally, agent output (runPrompt) is sent only to the prompting
  > socket and the user's own prompt is rendered client-side only, so chat
  > never crosses users even within one room. This Story makes the room
  > shared-per-project and makes chat shared + attributed. It is the
  > regression behind STORY-11's AC ("two browser sessions display each
  > other") which was only ever verified with mocked single-room sockets.
  > Bug-fix Story, separate from STORY-31. Session-reuse model approved by
  > the operator: the second joiner attaches to the existing session (no
  > new sessions row); a session stays = one sandbox boot
  > (containerId/previewUrl/endedAt); per-user attribution lives in git +
  > the presence roster.
  **Acceptance criteria:**
  - Two browser sessions (different users) opening the same project join the SAME room: each appears in the other's presence roster with avatar + name (STORY-11 AC, now true for real users, not mocked sockets).
  - A second user joining an already-live project does NOT boot a second sandbox or insert a second sessions row — they attach to the existing session and share its preview URL.
  - When user A prompts the agent, user B sees A's prompt (attributed to A) and the agent's streamed response in their own chat transcript, and vice versa.
  - When the last user leaves, the room and sandbox tear down exactly as before (no idle-shutdown change).
  **User flow:**
  1. User A opens project X — session + room created, sandbox boots.
  2. User B opens project X (via invite link) — POST /sessions finds the live room, attaches B to it, returns a ticket onto the existing sessionId.
  3. Both see each other in the presence bar.
  4. User A types a prompt — both A and B see 'A: <prompt>' then the agent's reply stream.
  **Out of scope:**
  - A single PERSISTENT shared agent (one long-lived claude-agent-acp process + ACP session both users contribute to) — today spawnAndPrompt spawns and kills an agent per prompt; making it persistent changes the sacred AcpHost interface shape and needs an ADR + both-contributor sign-off. Separate Story.
  - Agent prompt-control modes (serialised queue / turn-based handoff) — depends on the persistent shared agent. Separate follow-up Story.
  - Character-level co-editing via Yjs (post-POC).
  - :white_check_mark: **TASK-085** — Orchestrator: reuse the live project room on POST /sessions  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-033_
    > Add getRoomByProject(projectId) to runtime.ts. In POST /sessions,
    > if a live room already exists for the project, skip sandbox start /
    > preview registration / sessions-row insert and mint a ticket onto
    > the existing sessionId stamped with the joiner's identity; return
    > the existing previewUrl. Guard first-joiner races with a
    > per-project async create-lock so two simultaneous opens don't both
    > boot a sandbox. Teardown is unchanged (room + sandbox end when the
    > last socket leaves).
    _Task AC:_
    - Integration test: two POST /sessions for the same project return the same sessionId and only one sandbox start / one sessions row.
  - :white_check_mark: **TASK-086** :checkered_flag: — Share + attribute chat across the room  `high` `medium` _(services/orchestrator, apps/web)_  
    _depends on: TASK-085, TASK-032_
    > Orchestrator: broadcast agent_event frames to the whole room (not
    > just the prompting socket) and echo each prompt to the room stamped
    > with the sender's identity. Web: the chat panel renders peer
    > prompts and attributes streamed agent events to the prompting user
    > carried on the frame, replacing the single-client authorRef
    > assumption (chat-panel.tsx:29-30).
    _Task AC:_
    - Two connected clients both receive the same agent_event stream and the prompt is attributed to its sender in both transcripts.
    - STORY-32 acceptance_criteria satisfied.

- **STORY-33** — Single persistent shared agent per project room  [:white_check_mark: verified]
  > Implements ADR-0016. Today ClaudeAcpHost.spawnAndPrompt spawns a fresh
  > claude-agent-acp process + new ACP session per prompt and kills it on
  > turn end — so there is no conversation continuity even for one user,
  > and two users in a shared room (STORY-32) each trigger their own
  > ephemeral agent. This Story reshapes the sacred AcpHost interface from
  > a turn-scoped generator to a room-scoped session lifecycle
  > (openAgent → many prompt turns → close): one long-lived agent process
  > + ACP session per project room, opened lazily on first prompt, shared
  > by every user in the room, torn down with the room. The result is the
  > platform's core premise — one shared live coding session both users
  > drive, with the agent remembering prior turns. Turns are serialised
  > (one active turn per session); how that's surfaced to users (queue vs
  > handoff) is STORY-34. ACP change — see ADR-0016 (Accepted).
  **Acceptance criteria:**
  - The AcpHost interface exposes a session lifecycle (open → many prompt turns → close); the per-prompt spawn+kill in spawnAndPrompt is gone (ADR-0016).
  - Two successive prompts in one project (same or different users) run against the SAME agent process + ACP session — the second turn has the agent's memory of the first (conversation continuity), with no second process spawn.
  - While a turn is in flight, a second prompt does not start a concurrent turn — the host enforces one active turn per session and the user gets a clear 'agent busy' signal (the modes that change this are STORY-34).
  - If the agent process dies mid-session, the next prompt transparently opens a fresh session (workspace files persist; a notice surfaces) instead of erroring permanently.
  - The agent session is closed (process killed, ACP session ended) on room teardown / last-socket-leave / idle sweep — no leaked process; the 30-min idle-shutdown rule is unchanged.
  **User flow:**
  1. User A prompts — the agent session opens, runs the turn, and stays alive.
  2. User A or B prompts again — the same agent answers, remembering prior context, with no new process spawn.
  3. A second prompt mid-turn is rejected as 'agent busy' rather than racing a second agent.
  4. Everyone leaves the project — the agent session closes with the room.
  **Out of scope:**
  - Prompt-control modes (serialised queue vs turn-based handoff, toggleable) — STORY-34, pending a /ux-discovery pass on the handoff flow.
  - Routing interactive tool permissions to the controlling user — depends on STORY-34; auto-allow retained as today.
  - Character-level co-editing via Yjs (post-POC).
  - :white_check_mark: **TASK-087** — Reshape AcpHost to a persistent session lifecycle  `high` `large` _(packages/acp-host)_  
    _depends on: TASK-086_
    > Replace turn-scoped spawnAndPrompt with a session lifecycle:
    > openAgent(sandbox, handle, apiKey) → AgentSession with
    > prompt(text, opts): AsyncIterable<AcpEvent>, cancel(), and close().
    > Keep one long-lived agent process + ACP session (newSession once,
    > not per turn); enforce one active turn per session; cancel() cancels
    > the turn without ending the session, close() kills the process.
    > Surface agent-process death so the consumer can re-open. Update the
    > acp-host unit + integration tests (recorded-transcript subprocess)
    > to a multi-turn session. ACP change per ADR-0016.
    _Task AC:_
    - Integration test: two prompts over one AgentSession reuse a single process/session and the second turn sees the first turn's context; a concurrent prompt is rejected, not raced.
  - :white_check_mark: **TASK-088** — Orchestrator: hold the shared AgentSession on the room  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-087_
    > Store the AgentSession on SessionRoom (runtime.ts); open it lazily
    > on the first prompt in ws.ts runPrompt and reuse it thereafter;
    > broadcast its turn events to the room (STORY-32). Reject a prompt
    > that arrives while a turn is in flight with an 'agent_busy' signal;
    > on agent-process death, re-open on the next prompt and broadcast an
    > 'agent_restarted' notice. Close the session in endSession (room
    > teardown / last-socket / idle sweep). No idle-shutdown change.
    _Task AC:_
    - A second prompt during an active turn yields agent_busy and does not spawn a second agent; closing the room kills the agent process (no leak).
  - :white_check_mark: **TASK-089** :checkered_flag: — Web: surface agent busy + restarted; verify continuity  `high` `small` _(apps/web)_  
    _depends on: TASK-088_
    > Chat panel handles the 'agent_busy' signal (transient notice, input
    > not disabled) and the 'agent_restarted' notice. Verify end-to-end
    > that a follow-up prompt continues the same conversation. The full
    > two-browser shared-session check is live on the VPS post-deploy.
    _Task AC:_
    - Chat panel renders agent_busy without disabling input and shows the restarted notice.
    - STORY-33 acceptance_criteria satisfied.

- **STORY-34** — Prompt-control modes: serialised queue + turn-based handoff  [:white_check_mark: verified]
  > STORY-33 gives a project room ONE shared persistent agent, but the only
  > coordination today is a blunt agent_busy reject when two users prompt at
  > once. This adds two toggleable control modes (the operator's requirement)
  > so a pair can actually coordinate who drives the shared agent. Builds on
  > STORY-32 (shared room/chat) + STORY-33 (shared agent). Decisions from
  > /ux-discovery: default = serialised; mode persists per project; only the
  > project owner switches mode; turn-based handoff = holder passes/releases +
  > non-holders request → holder approves/declines; initial controller = owner;
  > serialised queue is visible + author-cancelable (FIFO); if the holder
  > disconnects, control auto-releases and a remaining user can claim it;
  > interactive tool-permission routing stays auto-allow (deferred).
  **Acceptance criteria:**
  - The active mode (serialised | turn-based) shows in the workspace header, persists per project across sessions, and is editable by the project owner only (others see it read-only).
  - Serialised mode (default): while a turn runs, further prompts from any user are QUEUED (not rejected); the pending queue is visible to all with author + text; a user can cancel their own queued prompt; queued prompts run FIFO as turns complete.
  - Turn-based mode: exactly one user holds control; only the holder can prompt; non-holders' input is disabled showing '<holder> has control'; the project owner holds control first.
  - Turn-based handoff: the holder can release or pass control to a named user; a non-holder can request control, which the holder approves or declines; if the holder disconnects, control auto-releases and any remaining user can claim it.
  - Switching modes is owner-only, broadcasts to the room, and switching to turn-based clears the serialised queue (with a notice) and sets the holder to the owner.
  **User flow:**
  1. Owner opens the project; the header shows 'Serialised' (default, loaded from the project setting).
  2. Both users type prompts; the agent runs them in turn; a second prompt appears in the visible queue and runs when the current turn finishes.
  3. Owner toggles to 'Turn-based'; the owner now holds control; the invited user's input is disabled with 'Owner has control'.
  4. Invited user clicks 'Request control'; the owner sees the request and clicks 'Approve'; control passes; now the invited user can prompt and the owner's input is disabled.
  5. Invited user clicks 'Release'; control returns to the owner.
  **Out of scope:**
  - Routing interactive tool-permission approvals to the controller (auto-allow retained — separate later story).
  - Per-user prompt threads (one shared transcript), >2-user delegation chains, Yjs co-editing.
  - :white_check_mark: **TASK-090** — DB: projects.controlMode column + migration  `high` `small` _(packages/db)_
    > Add a controlMode column to the projects table (text, values
    > 'serialised' | 'turn_based', default 'serialised') via Drizzle schema +
    > a generated migration. Codegen types updated. The orchestrator reads it
    > on room create and persists owner mode-switches to it.
    _Task AC:_
    - Migration adds projects.controlMode defaulting to 'serialised'; existing rows backfill to 'serialised'.
    - Drizzle codegen drift check passes.
  - :white_check_mark: **TASK-091** — Orchestrator: control-state foundation + owner-gated set_mode  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-090_
    > SessionRoom gains the live control state: mode (loaded from
    > projects.controlMode on room create), controlHolder (userId | null),
    > pending control requests, and the serialised queue. New WS messages:
    > set_mode (owner-only; rejected from non-owner; persists to
    > projects.controlMode). Broadcast a control_state frame (mode, holder,
    > requests, queue summary) to the room on every change. The web app passes
    > the authenticated user's ownerness into the session so the orchestrator
    > can gate owner-only actions server-side.
    _Task AC:_
    - set_mode from a non-owner is rejected; from the owner it updates room state, persists to projects.controlMode, and broadcasts control_state.
    - control_state is broadcast to all sockets on mode/holder/queue change.
  - :white_check_mark: **TASK-092** — Orchestrator: serialised queue (enqueue / drain / cancel)  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-091_
    > In serialised mode, a prompt arriving while a turn is in flight is
    > ENQUEUED (FIFO) instead of returning agent_busy; on turn-complete the
    > next queued prompt drains automatically against the shared agent. New WS
    > message cancel_queued (author-only) removes a pending entry. A user
    > leaving drops their queued entries. Switching to turn-based clears the
    > queue (notice). Queue changes broadcast via control_state.
    _Task AC:_
    - Integration test: with a turn active, a second prompt enqueues; on completion it drains and runs; the author can cancel a queued entry; a leaver's entries are dropped.
  - :white_check_mark: **TASK-093** — Orchestrator: turn-based control + handoff  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-091_
    > In turn-based mode, only controlHolder may prompt (a non-holder prompt
    > is rejected not_in_control); the owner is the initial holder. WS messages:
    > request_control, grant_control / decline_control (holder only),
    > release_control, pass_control (to a named userId). On holder disconnect,
    > control auto-releases (null) and a remaining user's request auto-grants.
    > All transitions broadcast control_state.
    _Task AC:_
    - Integration test: non-holder prompt is rejected; request→grant transfers control; release vacates; holder disconnect auto-releases and a remaining user can claim.
  - :white_check_mark: **TASK-094** — Web: control bar — mode toggle + turn-based control UI  `high` `medium` _(apps/web)_  
    _depends on: TASK-093_
    > A ControlBar in the workspace header (next to PresenceBar) consuming the
    > control_state frame: shows the active mode with an owner-only toggle
    > (read-only for non-owners); in turn-based shows who holds control, a
    > 'Request control' button for non-holders, 'Approve'/'Decline' on an
    > incoming request for the holder, and 'Release' / 'Pass to <user>' for the
    > holder. The chat input is disabled for non-holders with '<holder> has
    > control'. Keyboard-accessible; SR labels reflect control state; the
    > request-approval surface is an accessible dismissible prompt, not a
    > vanishing toast.
    _Task AC:_
    - Owner sees an editable mode toggle; non-owner sees it read-only. In turn-based, a non-holder's input is disabled with '<holder> has control' and Request/Approve/Release controls drive handoff off control_state.
  - :white_check_mark: **TASK-095** — Web: serialised queue UI  `high` `small` _(apps/web)_  
    _depends on: TASK-092_
    > In serialised mode, render the pending queue from control_state (each
    > entry: author avatar+name + prompt text) with a cancel control on the
    > current user's own entries (sends cancel_queued). Integrates with the
    > chat panel; the agent_busy notice is replaced by the queued state.
    _Task AC:_
    - A queued prompt shows in the list with its author; the author sees a cancel control that removes it; non-authors cannot cancel it.
  - :white_check_mark: **TASK-096** :checkered_flag: — E2E/integration: both modes end to end  `med` `medium` _(apps/web)_  
    _depends on: TASK-094, TASK-095_
    > Two-client coverage: serialised (enqueue + cancel-own + FIFO drain) and
    > turn-based (owner initial control → invited user requests → owner approves
    > → invited prompts → release), plus owner-only mode switch (non-owner
    > rejected). Live two-browser shared-session behaviour is verified on the
    > VPS post-deploy per the deploy-layer-live convention.
    _Task AC:_
    - Serialised: a second prompt during a turn enqueues, the author can cancel it, and it drains on completion.
    - Turn-based: request→approve transfers control, the non-holder's input gates correctly, release returns control.
    - STORY-34 acceptance_criteria satisfied.

- **STORY-35** — Survive brief disconnects: reconnect grace window  [:white_check_mark: verified]
  > Today the orchestrator tears a room down the instant the last socket
  > leaves (ws.ts onClose → endSession), which kills the shared persistent
  > agent (STORY-33). So a solo user refreshing the page loses their live
  > agent + conversation, and a fresh agent starts with no memory — exactly
  > the "I told it to remember marmalade, refreshed, it forgot" report. This
  > adds a short reconnect grace window: on last-socket-leave, defer teardown
  > (~90s) instead of firing immediately; a socket rejoining within the
  > window (a refresh, a network blip) reattaches to the SAME live room +
  > agent (STORY-32 room reuse already does this), so the conversation
  > survives. If nobody returns within the window, teardown proceeds as
  > before. Orchestrator-only — the web client already re-POSTs /sessions
  > and reconnects on reload. No idle-shutdown change (the 30-min sweep is
  > unchanged; this is disconnect grace, not idle); no ADR. Cross-session
  > memory after a true teardown (workspace CLAUDE.md auto-load / ACP
  > session-load) is a separate, later investigation — out of scope here.
  **Acceptance criteria:**
  - When the last socket leaves a room, teardown is deferred by a grace window (default ~90s) rather than firing immediately.
  - If any socket rejoins the room before the window elapses, the deferred teardown is cancelled and the same live room + agent + sandbox are reused (conversation intact) — verified by a page refresh keeping the agent's in-session memory.
  - If no socket rejoins within the window, the room, agent, and sandbox tear down exactly as before.
  - The 30-minute idle-shutdown backstop is unchanged.
  **User flow:**
  1. A solo user is mid-conversation with the agent and refreshes the page.
  2. Their socket drops; the orchestrator schedules teardown ~90s out instead of ending the session immediately.
  3. The reloaded page reconnects within a second or two; the orchestrator cancels the teardown and the user is back in the same live session, agent memory intact.
  4. If instead they close the tab and don't return, the session tears down after the grace window.
  **Out of scope:**
  - Cross-session memory after a true teardown (persisting durable facts to workspace CLAUDE.md/AGENTS.md, or ACP session-load to resume a conversation) — separate investigation + story.
  - Per-user reconnection tokens / resumable WS cursors (the client re-mints a session on reload).
  - :white_check_mark: **TASK-097** :checkered_flag: — Orchestrator: defer room teardown with a reconnect grace window  `high` `small` _(services/orchestrator)_  
    _depends on: TASK-088_
    > Add a per-room teardown timer to SessionRoom plus
    > scheduleRoomTeardown(room, graceMs, onElapse) / cancelRoomTeardown(room)
    > in runtime.ts. In ws.ts onClose, when room.sockets.size === 0, call
    > scheduleRoomTeardown(room, RECONNECT_GRACE_MS, endSession) instead of
    > endSession directly; the timer only fires endSession if sockets are
    > still empty when it elapses. In ws.ts onOpen, cancelRoomTeardown(room)
    > so a reconnecting socket keeps the live room + agent. Default grace
    > ~90s. Unit-test the scheduler with fake timers: elapses → onElapse;
    > rejoin before elapse (cancel) → not called; rejoin without cancel but
    > sockets non-empty at elapse → not called.
    _Task AC:_
    - Unit test (fake timers): teardown fires after the grace window when sockets stay empty; a rejoin within the window cancels it; a non-empty socket set at elapse skips teardown.
    - STORY-35 acceptance_criteria satisfied.

- **STORY-36** — Cross-session agent memory: persist the store + session/load  [:white_check_mark: verified]
  > Implements ADR-0017 (Accepted). Today the in-sandbox agent's session
  > history + memory live under the ephemeral container home dir
  > (~/.local/share/claude, ~/.config/claude), while only /workspace is
  > durable (named volume + MinIO, ADR-0008) — so a true teardown (closed
  > tab, idle sweep) forgets everything, even though claude-agent-acp@0.39.0
  > supports ACP session/load (stable). This Story makes a project's agent
  > memory durable and resumes the prior conversation on a fresh session:
  > relocate the SDK's store onto a persisted path, and call loadSession
  > (with a newSession fallback) instead of always newSession. Builds on
  > ADR-0016 (persistent shared agent) + STORY-35 (refresh grace window).
  > ACP change — see ADR-0017.
  **Acceptance criteria:**
  - After a full teardown and a fresh session in the same project, the agent resumes the prior conversation (a fact stated before teardown is recalled after) — verified live with a real agent.
  - The agent's session/config store persists across teardown (it no longer lives only on the ephemeral container layer); the persisted store is hidden from the user's file tree, file watcher, and git.
  - If the prior session can't be resumed (missing/corrupt/incompatible store), the agent starts fresh with a surfaced 'couldn't resume earlier conversation' notice — never a hard error.
  - Deleting a project purges its persisted agent store (no orphaned memory left behind).
  **User flow:**
  1. A user works with the agent, then everyone leaves and the session tears down (past the grace window).
  2. Later they reopen the project; a fresh agent session loads the prior conversation and the agent remembers what was discussed.
  3. If the store can't be loaded, they see a brief 'starting a fresh conversation — earlier context couldn't be restored' notice and continue.
  **Out of scope:**
  - Per-user transcript split (one shared session per project, per ADR-0016).
  - A user-facing 'reset agent memory' control (likely follow-up).
  - ACP session/load for non-Claude agents (Codex) — same swap point, separate work.
  - :white_check_mark: **TASK-098** — Verify the agent store path + relocation mechanism (sandbox)  `high` `small` _(packages/sandbox)_  
    _depends on: TASK-087_
    > Run the sandbox base image and confirm WHERE claude-agent-acp@0.39.0
    > + the bundled @anthropic-ai/claude-code actually write session
    > history and config, and that setting HOME (or a config-dir env var)
    > relocates the whole store. Document the verified path + env var in
    > docs/conventions/orchestrator-runtime.md (or the deploy runbook) so
    > TASK-099 relocates the right thing. Mandatory per ADR-0017 (don't
    > hard-code from third-party docs).
    _Task AC:_
    - Documented: the exact on-disk store path in the base image and the env var that relocates it, confirmed by inspecting a running container.
  - :white_check_mark: **TASK-099** — Persist + relocate the agent store onto durable storage  `high` `medium` _(packages/acp-host, services/orchestrator)_  
    _depends on: TASK-098_
    > Spawn the agent with HOME (or the verified env var from TASK-098)
    > pointed at a durable, hidden path that survives teardown — default a
    > dotted dir under the persisted /workspace volume (e.g.
    > /workspace/.praxis-agent) so it rides the existing MinIO snapshot.
    > Exclude that path from the file list + file watcher (file-ops /
    > presence) and add it to the sandbox git ignore so it never shows in
    > the user's tree or commits. Project delete must purge it.
    _Task AC:_
    - The agent's store is written under the persisted path; it does not appear in file_list, file_changed events, or git status; project delete removes it.
  - :white_check_mark: **TASK-100** — Resume the prior conversation via ACP session/load  `high` `large` _(packages/acp-host, services/orchestrator, packages/db)_  
    _depends on: TASK-099, TASK-088_
    > Persist the ACP sessionId per project (a column on projects or a
    > sessions lookup + migration). Extend AcpHost.openAgent to accept an
    > optional resumeSessionId; when present, call connection.loadSession
    > instead of newSession; on load failure or no prior id, fall back to
    > newSession and emit a 'couldn't resume' signal (reuse the STORY-33
    > agent_restarted-style channel). The orchestrator records the new
    > sessionId after a fresh open and passes the stored one on reopen.
    _Task AC:_
    - Unit/integration: openAgent with a known resumeSessionId calls loadSession; an unknown/failed id falls back to newSession and surfaces the couldn't-resume signal; the sessionId is persisted after a fresh open.
  - :white_check_mark: **TASK-101** :checkered_flag: — Verify resume-across-teardown end to end  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-100_
    > Docker+key integration (gated like the acp-host live test): in one
    > session tell the agent a fact, tear the session down fully, reopen,
    > and assert the agent recalls it (loadSession path). Plus unit
    > coverage for the fallback notice. The full live two-user check is on
    > the VPS post-deploy per the deploy-layer-live convention.
    _Task AC:_
    - Integration test (Docker + key): a fact stated pre-teardown is recalled in a fresh post-teardown session; fallback path surfaces the notice.
    - STORY-36 acceptance_criteria satisfied.

- **STORY-37** — Persistent chat history: shown to everyone on (re)join  [:white_check_mark: verified]
  > Today the orchestrator broadcasts chat frames live but keeps no
  > transcript, so a user who joins mid-session — or reopens the project
  > later — starts with an empty chat and sees only new messages (operator
  > report after the STORY-32/33 live test). This persists the full chat
  > transcript per project and replays it to every client on join. Storage
  > is the existing (currently unused) events table, keyed by project_id +
  > time-indexed, so history spans ALL sessions of a project (survives
  > teardowns). Complements STORY-36 (which restores the agent's memory;
  > this restores the displayed transcript). No migration.
  **Acceptance criteria:**
  - Every chat message — a user's prompt, the agent's text reply (assembled per turn), tool calls, file-change notices, and errors — is persisted to the events table keyed by project, with its author and kind.
  - When a user opens or rejoins a project, the chat panel shows the FULL prior transcript across all of that project's sessions, correctly attributed, before any new live messages.
  - A user joining a live session mid-conversation sees everything said before they joined, not just subsequent messages.
  - Persisted history survives a full teardown — reopening the project on a later session still shows the whole conversation.
  **User flow:**
  1. Users A and B chat with the agent; each message is persisted.
  2. B refreshes or leaves and rejoins → the chat panel shows the full history, not just new messages.
  3. Later, either user reopens the project → the entire prior conversation is there.
  **Out of scope:**
  - Editing or deleting past messages; per-message read receipts.
  - Persisting raw streaming text-chunks (only assembled messages are stored).
  - Retention caps / pagination tuning (revisit if transcripts grow large).
  - :white_check_mark: **TASK-102** — Orchestrator: persist + serve project chat history via the events table  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-086_
    > As the orchestrator broadcasts chat (STORY-32), also persist each
    > message to events (projectId, userId, eventType, payload{author,…}):
    > user_prompt on a prompt; assembled agent_text on turn-complete (sum
    > the text-chunks of the turn); tool_call, file_change, agent_error as
    > they occur. On a socket join (ws.ts onOpen), query events for the
    > project ordered by created_at and send a chat_history frame (the
    > ordered message list) to that socket before live frames. Keyed by
    > projectId so history spans sessions.
    _Task AC:_
    - Unit/integration: prompting persists a user_prompt + an assembled agent_text row; a joining socket receives a chat_history frame with the prior messages in order.
  - :white_check_mark: **TASK-103** :checkered_flag: — Web: chat panel renders the history backfill on join  `high` `small` _(apps/web)_  
    _depends on: TASK-102_
    > The chat panel handles the chat_history frame: map persisted events
    > (user_prompt / agent_text / tool_call / file_change / agent_error) to
    > ChatMessage kinds, attributed to their author, and render them as the
    > initial transcript before/above live messages. Idempotent if a
    > history frame arrives again (e.g. reconnect).
    _Task AC:_
    - A chat_history frame renders the prior messages in order with correct authors; subsequent live frames append after it.
    - STORY-37 acceptance_criteria satisfied.

## EPIC-04 — Template, git, polish

Week 4. The single POC template (React + Three.js + Vite),
image-generation MCP feeding textures, the git panel, agent
auto-commit guidance, curated learning links, and the dogfood pass
that closes the POC.

- **STORY-14** — React + Three.js + Vite template scaffold  [:white_check_mark: verified]
  > templates/react-threejs-scene with Vite + React + TypeScript +
  > @react-three/fiber + drei. template.json declares preview port
  > 5173, harness claude-code, MCP servers [image-gen]. AGENTS.md
  > gives Claude Code Three.js conventions and texture-loading
  > patterns from public/textures/.
  **Acceptance criteria:**
  - Creating a project from `react-threejs-scene` lands the scaffold in the sandbox; `npm run dev` from inside the sandbox renders a starter cube scene visible in the preview URL.
  - Template AGENTS.md is loaded by Claude Code on its first turn (verified via the agent quoting one of its rules).
  **Out of scope:**
  - Additional templates (post-POC).
  - Asset pipelines for GLB/GLTF (later, if needed).
  - :white_check_mark: **TASK-039** — Scaffold templates/react-threejs-scene/  `high` `medium` _(templates/react-threejs-scene)_  
    _depends on: TASK-001_
    > Vite + React + TypeScript + @react-three/fiber + drei +
    > eslint + prettier. Starter scene with a rotating cube and a
    > skybox slot ready for an image-gen texture.
    _Task AC:_
    - Local `npm run dev` renders the starter cube on http://localhost:5173.
  - :white_check_mark: **TASK-040** — template.json + AGENTS.md + mcp-servers.json + sandbox.json  `high` `small` _(templates/react-threejs-scene)_  
    _depends on: TASK-039_
    > template.json matches §11 example with id react-threejs-scene.
    > AGENTS.md documents Three.js conventions, texture loading from
    > /public/textures, image-gen usage rules. mcp-servers.json
    > enables image-gen. sandbox.json sets base image and port 5173.
    _Task AC:_
    - Schema validation for template.json passes against the (yet-to-be-written) validator.
  - :white_check_mark: **TASK-041** :checkered_flag: — End-to-end: create project from template, see preview URL render  `high` `medium` _(services/orchestrator, apps/web)_  
    _depends on: TASK-040, TASK-038, TASK-029_
    > POST /projects with template_id=react-threejs-scene copies
    > scaffold into the sandbox, runs `npm install`, exposes port
    > 5173, returns the preview URL. UI shows preview iframe.
    _Task AC:_
    - End-to-end Playwright test creates a project and asserts the preview iframe renders the cube.
    - STORY-14 acceptance_criteria satisfied.

- **STORY-15** — Image-generation MCP server (textures for Three.js)  [:white_check_mark: verified]
  > infrastructure/mcp-servers/image-gen exposes a `generate_image`
  > tool backed by the OpenAI Image API. Claude Code discovers it
  > via the template's mcp-servers.json and calls it for texture
  > generation; outputs land in /public/textures/ and become
  > loadable in the running scene.
  **Acceptance criteria:**
  - Claude Code in a react-threejs-scene project, prompted to add a stone texture, calls `generate_image` and writes a PNG into /public/textures/; the scene loads it within the same turn.
  - Per-project per-day usage cap is enforced (default 50 calls); the 51st call returns an error response from the MCP server.
  **Out of scope:**
  - Multi-provider image generation (later).
  - Image editing / inpainting (later).
  - :white_check_mark: **TASK-042** — infrastructure/mcp-servers/image-gen MCP server  `high` `large` _(infrastructure/mcp-servers)_ · [PR](https://github.com/g-chappell/praxis/pull/310)  
    _depends on: TASK-001_
    > MCP server (stdio) implementing tools/list + tools/call for
    > generate_image. Args: prompt, width, height, save_path. Uses
    > OPENAI_API_KEY from the sandbox env; defaults save_path to
    > /workspace/public/textures/<slug>.png.
    _Task AC:_
    - Standalone test against the MCP server returns a PNG file on disk.
  - :white_check_mark: **TASK-043** — Per-project usage cap  `high` `small` _(infrastructure/mcp-servers, services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/310)  
    _depends on: TASK-042_
    > Counter stored in Postgres (events table or a small `mcp_usage`
    > table). MCP server reads PROJECT_ID + cap from env on startup
    > and rejects with an explicit error after the cap is hit.
    _Task AC:_
    - Integration test crosses the cap and observes a clean refusal.
  - :white_check_mark: **TASK-044** :checkered_flag: — Wire MCP server into the react-threejs-scene sandbox  `high` `medium` _(templates/react-threejs-scene, packages/sandbox, services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/311)  
    _depends on: TASK-042, TASK-040, TASK-022, TASK-106_
    > Per ADR-0018 (Path A — confirmed by spike): at project creation the
    > orchestrator seeds /workspace/.mcp.json (server command, no secrets) +
    > /workspace/.claude/settings.json (enableAllProjectMcpServers) so Claude
    > Code auto-connects the stdio server — acp-host untouched. Bundle +
    > bake the image-gen server into sandbox-base. Deliver the OpenAI key
    > (from TASK-106, platform-owned) + the usage URL/token to the server
    > via an ephemeral config file outside /workspace (never git/MinIO).
    > Operator: paste the OpenAI key in /admin + rebuild sandbox-base.
    _Task AC:_
    - End-to-end: Claude Code is asked to add a stone texture; sees it appear in the preview.
    - STORY-15 acceptance_criteria satisfied.

- **STORY-16** — Git panel — branch, log, diff, revert  [:white_check_mark: verified]
  > A panel in the workspace shows the project's current branch,
  > recent commits with author + message + timestamp, working tree
  > status, and per-file diffs in Monaco's diff editor. Revert
  > rewinds the working tree to a chosen commit with a confirm step.
  **Acceptance criteria:**
  - After at least one auto-commit, the git panel lists it with author = prompting user and the commit message the agent wrote.
  - Revert to a chosen commit restores the working tree; subsequent diff view confirms the change.
  **User flow:**
  1. User opens git panel
  2. Sees current branch + last 20 commits
  3. Clicks a commit → diff renders in Monaco diff mode
  4. Clicks Revert → confirmation modal → working tree resets
  **Out of scope:**
  - Branches / merges UI (later).
  - Pushing to a remote (later).
  - :white_check_mark: **TASK-045** — Orchestrator: git data API (branch, log, status, diff)  `high` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/312)  
    _depends on: TASK-029_
    > GET /projects/<id>/git/{branch,log,status} and
    > /git/diff?from=<sha>&to=<sha>. Backed by Sandbox.exec running
    > git commands in the project directory.
    _Task AC:_
    - All four endpoints return structured JSON; integration tests pass.
  - :white_check_mark: **TASK-046** :checkered_flag: — Frontend: GitPanel component + revert with confirmation  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/312)  
    _depends on: TASK-045, TASK-030_
    > GitPanel mounts in workspace right rail. Log list, file diff
    > via Monaco diff editor, Revert action with a 'Type the commit
    > SHA to confirm' modal.
    _Task AC:_
    - Manual test: revert a known commit, working tree state matches.
    - STORY-16 acceptance_criteria satisfied.

- **STORY-17** — Agent auto-commit policy + curated learning links  [:white_check_mark: verified]
  > The agent's system prompt and the template AGENTS.md guide
  > Claude Code to commit at meaningful stages with imperative-mood
  > messages, attributed to the prompting user via git author. The
  > learning_links table is seeded with curated entries from
  > Anthropic Cookbook, OpenAI Codex docs, git tutorials, and
  > agentic-prompting guides; the workspace surfaces them.
  **Acceptance criteria:**
  - After completing one of the dogfood tasks in STORY-18, the project has ≥3 git commits with imperative messages and the prompting user as author.
  - learning_links has ≥10 entries spanning ACP, MCP, Three.js, git, and agentic-prompting topics; the workspace learning panel renders them grouped by topic.
  **User flow:**
  1. Agent finishes a coherent unit of work
  2. Agent runs `git add` and `git commit -m '<imperative message>'`
  3. Commit appears in the git panel attributed to the prompter
  4. User opens learning panel and sees topic-grouped links
  **Out of scope:**
  - In-house authored learning content (post-POC).
  - Progress tracking on link interactions (post-POC).
  - :white_check_mark: **TASK-047** — Auto-commit guidance in template AGENTS.md + a /commit skill  `high` `small` _(templates/react-threejs-scene)_ · [PR](https://github.com/g-chappell/praxis/pull/314)  
    _depends on: TASK-040_
    > AGENTS.md section: when to commit (task complete; before
    > destructive op; on user ask) and how (imperative mood,
    > concise, references task). Add a small skill under
    > .claude/skills/commit-checkpoint/SKILL.md.
    _Task AC:_
    - Agent in a dogfood session commits at the expected moments without explicit prompting.
  - :white_check_mark: **TASK-048** — Seed learning_links with ≥10 curated entries  `med` `small` _(packages/db, apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/316)  
    _depends on: TASK-011_
    > Seed file in packages/db/seeds/learning-links.ts. Entries
    > cover ACP overview, MCP overview, Three.js + drei,
    > react-three-fiber patterns, OpenAI image API, git basics,
    > agentic prompting (Anthropic), Cookbook samples, Caddy
    > on-demand TLS, Better Auth.
    _Task AC:_
    - Seed runs idempotently; SELECT COUNT(*) FROM learning_links ≥10.
  - :white_check_mark: **TASK-049** — Workspace learning panel grouped by topic  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/316)  
    _depends on: TASK-048, TASK-032_
    > Collapsible panel near the chat panel grouping links by topic
    > tag. Cards: title + source. External links open in a new tab.
    _Task AC:_
    - Snapshot test of the panel rendering grouped links.
    - STORY-17 acceptance_criteria satisfied.
  - :white_check_mark: **TASK-151** — Attribute agent git commits to the initiating user (fallback: project owner)  `med` `medium` _(services/orchestrator, packages/acp-host)_ · [PR](https://github.com/g-chappell/praxis/pull/316)  
    _depends on: TASK-047_
    > Configure the sandbox git author so commits the agent makes are
    > attributed to the user who sent the prompt for that turn, defaulting
    > to the project owner when the prompter can't be resolved. Set
    > GIT_AUTHOR_NAME / GIT_AUTHOR_EMAIL (and the matching committer vars)
    > per turn — e.g. as the orchestrator hands a prompt to the agent — so
    > in a multiplayer room each commit reflects whoever prompted, not one
    > fixed identity. Implements STORY-17 AC "commits ... with the prompting
    > user as author"; the template guidance (TASK-047) covers commit
    > timing/messages only, not authorship.
    _Task AC:_
    - A commit made during user A's turn has author = user A; a commit during user B's turn has author = user B.
    - When the prompter can't be resolved, the commit author defaults to the project owner.
  - :white_check_mark: **TASK-152** — Auto-commit fix: load guidance + turn-end safety commit  `high` `medium` _(templates/react-threejs-scene, services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/318)  
    _depends on: TASK-047, TASK-151_
    > TASK-047 shipped commit guidance into the template AGENTS.md, but the
    > in-sandbox Claude Code agent reads CLAUDE.md (not AGENTS.md) and the
    > template has no CLAUDE.md bridge, so the guidance + commit-checkpoint
    > skill never reach the model — verified live: an agent turn made edits
    > but no commit. Two fixes:
    > 1. Loading fix: add a template CLAUDE.md (`@AGENTS.md`) and a
    >    `.claude/settings.json` with `settingSources: ["project"]` so the
    >    agent loads the guidance + skill every turn (settings merge with
    >    mcp-seed's enableAllProjectMcpServers).
    > 2. Deterministic safety-net: at turn-complete the orchestrator commits
    >    any uncommitted /workspace changes via sandbox.exec, authored by
    >    the per-turn identity from TASK-151. Done orchestrator-side (not a
    >    settings.json Stop hook) because the claude-agent-acp adapter does
    >    not expose hooks (ADR-0009) — a Stop hook could silently never fire.
    > Together: ≥3 commits per dogfood session (count guaranteed by the
    > safety-net) with imperative messages (agent follows loaded guidance)
    > attributed to the prompter — satisfies STORY-17 AC#1.
    _Task AC:_
    - A new project's agent commits during a dogfood session without explicit prompting; if it leaves changes uncommitted, the orchestrator commits them at turn end.
    - Commits are authored by the prompting user; a session of ≥3 turns yields ≥3 commits.
  - :white_check_mark: **TASK-153** :checkered_flag: — Descriptive turn-end commit messages from the user's prompt  `high` `small` _(services/orchestrator, templates/react-threejs-scene)_ · [PR](https://github.com/g-chappell/praxis/pull/320)  
    _depends on: TASK-152_
    > Live test of TASK-152 showed: the safety-net commits ≥3 times,
    > correctly authored by the prompter — but all messages were the
    > generic "Checkpoint: save changes from this turn", failing the AC's
    > "imperative messages". Root cause confirmed: the claude-agent-acp
    > adapter already sets settingSources=[user,project,local], so CLAUDE.md
    > IS loaded — but guidance-based auto-commit is inherently unreliable
    > (the model just doesn't commit on its own). So the host-side commit is
    > the source of truth; make ITS message descriptive by deriving it from
    > the user's prompt (first line, trimmed/truncated). Also drop the no-op
    > `.claude/settings.json` settingSources from the template (settingSources
    > is a programmatic/CLI option, not a settings-file key — it did nothing).
    > Keep the CLAUDE.md bridge (correct + gives the agent project context).
    _Task AC:_
    - Each turn that changes files produces one commit whose message is derived from that turn's prompt, authored by the prompter.
    - A ≥3-turn dogfood session yields ≥3 commits with prompt-descriptive messages.

- **STORY-51** — Reliable preview isolation, workspace readiness gate, and session teardown  [:white_check_mark: verified]
  > Dogfood-surfaced platform bug class (found 2026-06-07, evidence on the
  > VPS): a freshly-opened project showed ANOTHER project's preview, and the
  > file panel didn't load until the first turn finished. Root cause is three
  > pre-existing defects (NOT the turn-end commit work):
  >   1. Cross-project preview bleed — the preview registry maps
  >      projectId→{ip,port}; port is fixed at 5173 for all projects of a
  >      template, sandboxes share praxis-net with Docker IP reuse, and
  >      removePreview runs ONLY in endSession. Idle sweep + orchestrator
  >      restart never clear the registry, so a stale entry + a reused IP
  >      make proxyToSandbox serve the wrong project. The proxy blindly
  >      trusts the registered IP.
  >   2. No readiness gate — the dev server is fire-and-forget (~1 min npm
  >      install, preview 502s) yet the workspace renders immediately; the
  >      file tree loads via a file_list WS message that races rapid project
  >      switching.
  >   3. Stale-artifact buildup — idle sweep stops containers but never marks
  >      sessions.ended_at or clears the registry; restarts orphan containers
  >      + DB rows (live proof: an orphaned sandbox outlived a restart;
  >      sessions sat ended_at NULL for hours).
  **Acceptance criteria:**
  - Opening any project never shows another project's preview: the preview proxy serves only the container that currently carries that project's identity, re-resolved per request (stale/reused IPs are never served).
  - On opening a project the user sees a loading screen that holds until the workspace is fully ready — WS connected, file tree listed, and the dev server responding — so the file panel is never empty and the preview is never a 502/stale frame on entry.
  - When the last tab/user leaves (after the reconnect grace) or a sandbox is idle-swept, the container is removed, the preview registry entry is cleared, the session is marked ended in the DB, and the shared agent is closed — and the project volume (praxis-project-<id>) is preserved so files survive.
  - Orphaned containers/sessions from a prior orchestrator run are reconciled at boot: no orphan serves preview traffic and DB ended_at is consistent.
  **User flow:**
  1. User opens their newest project; a loading screen shows until files + preview are live; the preview is THEIR project.
  2. User closes all tabs; after the grace window the sandbox + preview + session tear down cleanly; reopening restores their files from the volume.
  **Out of scope:**
  - Deleting project files or volumes (idle-stop must preserve them).
  - Non-Docker sandbox backends / multi-region.
  - :white_check_mark: **TASK-154** — Defense-in-depth preview routing: re-resolve + verify the container per request  `high` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/322)
    > Stop trusting a write-once registered IP. Store the container id in
    > the registry target and resolve the live IP per preview request via
    > the existing Sandbox.exposePort(handle, port) (short TTL cache, e.g.
    > 5s, keyed by projectId). If the container is gone or stopped,
    > exposePort throws/returns no IP → do NOT serve (404/503), never a
    > reused IP. This eliminates the cross-project bleed without a Sandbox
    > interface change (no ADR needed). Cover with unit tests: stale entry
    > whose container is gone → no serve; live entry → correct IP; cache
    > hit avoids re-inspect within TTL.
    _Task AC:_
    - proxyToSandbox/preview resolution re-resolves the container's current IP per request (cached ≤ a few seconds) instead of trusting a stored IP; a registry entry whose container is gone/stopped is never served.
    - Unit tests cover stale-container (no serve), live-container (correct IP), and cache reuse.
  - :white_check_mark: **TASK-155** — Reliable teardown on every path + boot reconciliation  `high` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/322)  
    _depends on: TASK-154_
    > Make teardown consistent across endSession AND the idle sweep:
    > removePreview(projectId), mark sessions.ended_at, and close the shared
    > agent on BOTH paths (wire the idle-sweep onStop in sandbox-sweep.ts to
    > do registry + DB + agent cleanup). Add a boot-time reconciliation: on
    > orchestrator start, list running praxis sandboxes with no room and
    > mark their open DB sessions ended (and either adopt or stop+clean
    > orphans). NEVER remove the project volume — idle-stop snapshots +
    > removes the container only; files persist on praxis-project-<id>.
    _Task AC:_
    - Idle-sweep stop and last-tab endSession both clear the preview registry entry, set sessions.ended_at, and close the agent; the project volume is preserved.
    - On boot, orphaned containers/sessions from a prior run are reconciled (no orphan serves preview; DB ended_at consistent).
  - :white_check_mark: **TASK-156** :checkered_flag: — Full-readiness workspace loading screen  `high` `medium` _(services/orchestrator, apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/322)  
    _depends on: TASK-155_
    > Gate the workspace UI behind real readiness. Orchestrator probes the
    > dev-server preview target until it returns healthy and emits a
    > workspace_ready signal (WS frame or readiness field). The web client
    > shows a loading screen on project open until: WS connected AND the
    > file tree (file_list) has arrived AND workspace_ready (dev server
    > live). Only then render the workspace, so the file panel is never
    > empty and the preview is never a 502 on entry. Resume is fast
    > (node_modules cached on the volume).
    _Task AC:_
    - Opening a project shows a loading screen until WS connected + file tree listed + dev server healthy; the workspace then renders with a populated file panel and a live (own-project) preview.
    - STORY-51 acceptance_criteria satisfied (cross-project isolation verified live on the VPS).

- **STORY-18** — Internal dogfood + first university pair
  > Validate the POC by using it. Founders pair to build a small
  > Three.js game end-to-end inside the platform, capturing friction.
  > Then onboard one external pair of university students, observe a
  > session, file bugs, and write a short retro to close the POC.
  **Acceptance criteria:**
  - Founders complete a small Three.js game end-to-end inside the platform without manual workarounds.
  - One external pair completes a session; ≥5 issues filed; a retro doc is committed under docs/retros/.
  **User flow:**
  1. Founders open a project, prompt the agent to build a small game
  2. Iterate to a playable build, deploy to preview URL
  3. Onboard external pair for a 60-minute session
  4. Observe; file issues; write retro
  **Out of scope:**
  - Bug fixes from the dogfood session (folded into post-POC backlog).
  - :black_circle: **TASK-050** — Founders' dogfood pass and friction log  `high` `large`  
    _depends on: TASK-049, TASK-046, TASK-044, TASK-041_
    > Founders pair for one or two sessions building a small
    > Three.js game (e.g. ball-rolling, simple collector). Log
    > friction in docs/retros/dogfood-friction.md as it happens.
    _Task AC:_
    - Friction log file exists with ≥10 entries.
  - :black_circle: **TASK-051** — External pair session + bug filing  `high` `medium`  
    _depends on: TASK-050_
    > Recruit one pair (university). Observe a 60-minute session.
    > File each surfaced issue as a GitHub issue with steps to
    > reproduce.
    _Task AC:_
    - ≥5 GitHub issues filed and labelled `from:user-test-1`.
  - :black_circle: **TASK-052** :checkered_flag: — POC retro doc  `high` `small`  
    _depends on: TASK-051_
    > docs/retros/2026-XX-poc-close.md: what worked, what broke,
    > what's next, signal vs noise from the external pair. Closes
    > the POC milestone.
    _Task AC:_
    - Retro doc committed.
    - STORY-18 acceptance_criteria satisfied.

## EPIC-05 — Platform operations & admin

Operational capabilities the platform-owned-key model (ADR-0009) requires.
The POC pivoted from per-user subscription OAuth to a platform-owned
Anthropic API key billed under the Commercial Terms — hosted multiplayer
cannot run on a personal subscription. That introduces obligations the
earlier epics don't cover: an authenticated admin area, the platform API
key's lifecycle (encrypted at rest, rotation), and per-project usage
metering with budget enforcement so real spend stays bounded. This epic is
also the foundation future admin capabilities (user management, feature
flags, observability) mount into.

- **STORY-20** — Admin area shell with role-based access  [:white_check_mark: verified]
  > An admin-only section in apps/web, gated by a role on the users table
  > (seeded for the two contributors). Navigation, layout, and the
  > authorization boundary that later admin features (API keys, usage,
  > budgets) mount into. Establishes "who is an admin" once, in Postgres.
  **Acceptance criteria:**
  - A non-admin who navigates to /admin is denied (redirect or 403); an admin sees the admin dashboard.
  - The two contributor accounts are admins via a seeded role persisted in Postgres; role survives a fresh migrate+seed.
  **User flow:**
  1. Admin signs in and opens /admin
  2. Admin dashboard lists available sections (API keys, usage) with empty states for the not-yet-built ones
  3. Non-admin hitting /admin is bounced to /dashboard
  **Out of scope:**
  - The individual admin features themselves (keys: STORY-21; usage: STORY-22/23).
  - Multi-role hierarchies / fine-grained permissions beyond admin vs not.
  - :white_check_mark: **TASK-054** — Add a role to the users schema + migration + seed the two contributors as admin  `high` `small` _(packages/db)_  
    _depends on: TASK-011_
    > Add a `role` column (enum: 'user' | 'admin', default 'user') to the
    > users table in packages/db schema; generate the migration and run
    > codegen. Seed the two contributor accounts as 'admin' via an
    > idempotent seed/migration so a fresh VPS rebuild reproduces it.
    _Task AC:_
    - users.role exists with a migration; pnpm db:codegen is clean.
    - A seed marks the two contributor emails as admin idempotently.
  - :white_check_mark: **TASK-055** — /admin route group with role-gated middleware and layout shell  `high` `medium` _(apps/web)_  
    _depends on: TASK-054, TASK-014_
    > Add an /admin route group with a server-side authorization check
    > (admin role required) reusing the Better Auth session. Provide the
    > admin layout + nav shell. Non-admins are redirected; unauthenticated
    > users hit the sign-in flow.
    _Task AC:_
    - Middleware/route guard denies non-admins and allows admins (covered by a test).
  - :white_check_mark: **TASK-056** :checkered_flag: — Admin dashboard landing with sections index  `med` `small` _(apps/web)_  
    _depends on: TASK-055_
    > The /admin landing page: a sections index linking to API keys and
    > usage, with clear empty states for sections that land in later
    > stories. No mock data — real links, real empty states.
    _Task AC:_
    - Admin dashboard renders the sections index for an admin.
    - STORY-20 acceptance_criteria satisfied.

- **STORY-21** — Platform Anthropic API key management (encrypted, rotation)  [:white_check_mark: verified]
  > Admin UI + storage for the platform Anthropic API key that powers all
  > agent sessions (ADR-0009). The key is pasted once, encrypted at rest
  > with @praxis/crypto (same posture as oauth_tokens), and never returned
  > in plaintext or logged afterwards — reads show a masked value plus
  > metadata only. Single active key with rotation: rotating replaces the
  > active key and retains the previous one encrypted, inactive, for audit.
  > A server-side accessor returns the decrypted active key to the
  > orchestrator at agent-spawn time (consumed by AcpHost; wired in the
  > orchestrator under STORY-09).
  **Acceptance criteria:**
  - An admin can paste an API key; it is stored encrypted (never plaintext, never logged) and no read path returns the raw value — masked display + metadata only.
  - Rotating sets a new active key and marks the prior key inactive but retained (encrypted) for audit; new sessions use the active key.
  - getActivePlatformKey() returns the decrypted active key server-side, or fails loudly when none is set.
  **User flow:**
  1. Admin opens /admin → API keys
  2. Admin pastes the platform key and saves; UI then shows only a masked key + created/rotated metadata
  3. Admin rotates: pastes a new key; the old one is retained inactive for audit
  **Out of scope:**
  - Multiple concurrent keys / per-project keys (single active key by ADR-0009).
  - Automated rotation, Stripe/billing integration.
  - The orchestrator's spawn-time consumption (STORY-09 wiring; this story only provides the accessor).
  - :white_check_mark: **TASK-057** — platform_api_keys table (encrypted value, active flag, audit columns) + migration  `high` `small` _(packages/db)_  
    _depends on: TASK-011, TASK-019_
    > Schema for platform_api_keys: encrypted key material (via
    > @praxis/crypto), an active flag, created_by, created_at,
    > last_rotated_at. Migration + codegen. Never store plaintext.
    _Task AC:_
    - Table + migration exist; codegen clean; the key column holds ciphertext only.
  - :white_check_mark: **TASK-058** — Key service: set / rotate / deactivate + getActivePlatformKey() accessor  `high` `medium` _(packages/db, apps/web)_  
    _depends on: TASK-057_
    > Service that encrypts on write and decrypts on read via
    > @praxis/crypto: setActivePlatformKey(raw), rotate (new active, old
    > retained inactive), and getActivePlatformKey() returning the
    > decrypted active key for server-side consumers (the orchestrator).
    > Loud-fail when no active key is configured. Never log raw values.
    _Task AC:_
    - Unit tests cover set, rotate (old marked inactive), and the no-key loud-fail; no test logs a raw key.
  - :white_check_mark: **TASK-059** :checkered_flag: — Admin UI: paste key, masked display + metadata, rotate  `high` `medium` _(apps/web)_  
    _depends on: TASK-058, TASK-055_
    > Admin → API keys page: paste-and-save, then a masked-only display
    > with created/rotated metadata and a rotate action. No endpoint
    > echoes the raw key back. Clear empty state + loud banner when no
    > active key is set.
    _Task AC:_
    - An admin can set and rotate the key through the UI; the raw value is never re-displayed.
    - STORY-21 acceptance_criteria satisfied.

- **STORY-22** — Per-project usage metering (record + display)  [:white_check_mark: verified]
  > Persist the token usage emitted on each AcpEvent turn-complete
  > (ADR-0009), attributed to project and session, and surface cumulative
  > usage (with a cost estimate) to the project owner. The data foundation
  > for budget enforcement (STORY-23) and any later billing.
  **Acceptance criteria:**
  - Each completed turn records input/output token usage attributed to its project and session in Postgres.
  - A project owner sees cumulative usage and a cost estimate for their project.
  **Out of scope:**
  - Budget caps / enforcement (STORY-23).
  - Invoicing or payment integration (post-POC).
  - :white_check_mark: **TASK-060** — usage_events table (project, session, tokens, cost estimate) + migration  `med` `small` _(packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/337)  
    _depends on: TASK-011_
    > Schema for per-turn usage: project_id, session_id, input_tokens,
    > output_tokens, estimated_cost, created_at. Migration + codegen.
    _Task AC:_
    - Table + migration exist; codegen clean.
  - :white_check_mark: **TASK-061** — Orchestrator records usage from turn-complete events  `med` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/337)  
    _depends on: TASK-060, TASK-025, TASK-027_
    > In the session loop, persist a usage_events row from each AcpEvent
    > of type turn-complete (the usage payload AcpHost surfaces), keyed by
    > project + session.
    _Task AC:_
    - An integration/unit test shows a completed turn writes a usage row with the reported tokens.
  - :white_check_mark: **TASK-062** :checkered_flag: — Owner usage view (cumulative tokens + cost estimate)  `med` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/337)  
    _depends on: TASK-061_
    > Project-scoped usage view for the owner: cumulative input/output
    > tokens and an estimated cost, sourced from usage_events. Real data,
    > no placeholders.
    _Task AC:_
    - Owner sees real cumulative usage + cost estimate for a project.
    - STORY-22 acceptance_criteria satisfied.

- **STORY-23** — Per-project budget caps that pause sessions  [:white_check_mark: verified]
  > Bound real spend: a configurable per-project budget that, when
  > exceeded, pauses the project — new prompts are blocked with a clear
  > message until the budget is raised (by the owner or an admin). Builds
  > on usage metering (STORY-22) and the platform-key model (ADR-0009).
  **Acceptance criteria:**
  - A project has a configurable budget; when cumulative usage exceeds it, new prompts are blocked with a clear, actionable message.
  - Raising the budget (owner or admin) resumes prompting without losing session context.
  **Out of scope:**
  - Invoicing / payment (Stripe) — a later epic.
  - Org-level or cross-project pooled budgets.
  - :white_check_mark: **TASK-063** — Project budget configuration (limit) + owner/admin setting  `med` `small` _(packages/db, apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/339)  
    _depends on: TASK-060, TASK-055_
    > Add a per-project budget limit (schema + migration) and a setting
    > UI for the owner (and admin override). Sensible default.
    _Task AC:_
    - A project budget can be set and read; migration + codegen clean.
  - :white_check_mark: **TASK-064** :checkered_flag: — Enforce budget: block prompts over budget, resume on raise  `med` `large` _(services/orchestrator, apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/339)  
    _depends on: TASK-063, TASK-061, TASK-028_
    > Before accepting a prompt, compare cumulative usage to the budget;
    > when over, reject/pause with a clear message surfaced in the chat
    > UI and allow resume once the budget is raised. No silent drops.
    _Task AC:_
    - Over-budget prompts are blocked with a clear message; raising the budget resumes prompting.
    - STORY-23 acceptance_criteria satisfied.

- **STORY-24** — Reconcile Anthropic OAuth with the platform-key model  [:white_check_mark: verified]
  > Under ADR-0009 the platform API key powers inference; the per-user
  > Anthropic OAuth flow (STORY-06) is no longer used for it. Make that
  > explicit without discarding working code: ensure no code path passes a
  > per-user OAuth token to the agent, mark the "Connected to Anthropic" UI
  > as not-used-for-inference (or hide it behind a flag), and document the
  > credential as reserved for future identity / bring-your-own-key. Do not
  > modify oauth_tokens or @praxis/crypto.
  **Acceptance criteria:**
  - The agent-spawn path uses the platform API key exclusively; no code path forwards a per-user OAuth token to the agent.
  - The Settings 'Connected to Anthropic' UI reflects reality (hidden or clearly marked 'not used for inference under the current plan'), with a note in docs.
  **Out of scope:**
  - Deleting the OAuth flow or the oauth_tokens table.
  - Building the bring-your-own-key tier.
  - :white_check_mark: **TASK-065** — Ensure the platform key is the sole inference credential  `low` `small` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/390)  
    _depends on: TASK-058, TASK-027_
    > Audit the spawn path: confirm only ANTHROPIC_API_KEY (platform key)
    > reaches the agent and no CLAUDE_CODE_OAUTH_TOKEN / per-user OAuth
    > token is forwarded. Add a guard/test.
    _Task AC:_
    - A test asserts the agent env carries the platform key and no per-user OAuth token.
  - :white_check_mark: **TASK-066** :checkered_flag: — Settings UI + docs reflect OAuth's not-used-for-inference status  `low` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/390)  
    _depends on: TASK-065, TASK-020_
    > Update the 'Connected to Anthropic' Settings UI to state it is not
    > used for inference under the current plan (or hide behind a flag),
    > and note the reserved-for-future role in docs. Leave oauth_tokens
    > and @praxis/crypto untouched.
    _Task AC:_
    - Settings UI no longer implies OAuth powers sessions; docs note the reserved role.
    - STORY-24 acceptance_criteria satisfied.

- **STORY-38** — Multi-provider platform keys (OpenAI alongside Anthropic)  [:white_check_mark: verified]
  > Makes platform_api_keys multi-provider so external-API keys are managed
  > exactly like the platform Anthropic key (admin UI, encrypted at rest,
  > rotatable, role-gated). Driven by STORY-15: the image-gen MCP server
  > needs the OpenAI key delivered the platform way, not a VPS env-file
  > (operator decision 2026-06-05 + ADR-0018). Reuses the STORY-20/21 admin +
  > crypto posture, adding a provider dimension. TASK-044 (STORY-15) depends
  > on this.
  **Acceptance criteria:**
  - platform_api_keys is keyed by provider ('anthropic' | 'openai') with at most one ACTIVE key per provider; the migration backfills existing rows to 'anthropic'.
  - The admin platform-keys page manages the OpenAI key alongside Anthropic — paste / rotate / deactivate, value shown masked, role-gated server-side; getActivePlatformKey('openai') returns the decrypted key.
  - POST /sessions decrypts the active OpenAI key when one is set and passes it to the orchestrator alongside the Anthropic key; with no OpenAI key set, sessions still work (image-gen simply unavailable) — no hard failure.
  **User flow:**
  1. Admin opens /admin platform keys; sees Anthropic (existing) and OpenAI sections.
  2. Admin pastes the OpenAI key; it stores encrypted, shows masked, marked active.
  3. A new project session now has the OpenAI key available to the image-gen MCP server.
  **Out of scope:**
  - Per-user or per-project external keys (platform-owned only, POC).
  - Providers beyond Anthropic + OpenAI.
  - :white_check_mark: **TASK-104** — DB + key service: platform_api_keys provider column + per-provider active + accessor  `high` `medium` _(packages/db, apps/web)_
    > Add a `provider` column to platform_api_keys (default 'anthropic';
    > backfill existing rows), replace the single one-active index with a
    > one-active-per-provider partial unique index, + migration. Parametrise
    > the key service (set / rotate / deactivate / getActivePlatformKey) by
    > provider; existing Anthropic callers default to 'anthropic'.
    _Task AC:_
    - Migration adds provider, backfills 'anthropic', enforces one active per provider; getActivePlatformKey('anthropic') unchanged; getActivePlatformKey('openai') returns the active OpenAI key or null.
  - :white_check_mark: **TASK-105** :checkered_flag: — Admin UI: manage the OpenAI platform key (paste / rotate, masked, role-gated)  `high` `medium` _(apps/web)_  
    _depends on: TASK-104_
    > Extend the STORY-21 admin platform-keys surface to a second provider:
    > an OpenAI section to paste / rotate / deactivate, value shown masked,
    > role-gated server-side (mirrors the Anthropic section). No secret in
    > client bundles or logs.
    _Task AC:_
    - An admin can set + rotate the OpenAI key from /admin; a non-admin is refused server-side; the value is never returned in plaintext.
  - :white_check_mark: **TASK-106** :checkered_flag: — POST /sessions: decrypt + pass the active OpenAI key to the orchestrator  `high` `small` _(apps/web, services/orchestrator)_  
    _depends on: TASK-104_
    > In the web /api/sessions handler, also decrypt the active OpenAI
    > platform key (Node/libsodium, like the Anthropic key) and pass it to
    > the orchestrator over POST /sessions. The orchestrator holds it on the
    > room for the image-gen MCP wiring (STORY-15 TASK-044). Absent key →
    > omit, no error.
    _Task AC:_
    - When an OpenAI key is active, POST /sessions includes it (never logged); the orchestrator receives it. With none set, the session is created normally.

## EPIC-06 — Project lifecycle & workspace reliability

Surfaced by operator review of the live STORY-10 workspace. Two gaps make
the product unusable end-to-end today: a project can't be returned to or
deleted (the dashboard only creates), and the workspace itself has
reliability holes — saving an edited file fails in prod and the chosen
template is never seeded, so the workspace starts empty. This epic makes
projects manageable (create-with-name, list, open, delete-with-full-
cleanup) and closes those workspace gaps, with structured logging +
traceability throughout so future bugs are diagnosable.

- **STORY-26** — Fix workspace file save + scope file errors to the editor + observability  [:white_check_mark: verified]
  > Operator edited an agent-created file and hit "Session error" in chat;
  > the edit did NOT persist (verified: the project volume still held the
  > original content). Root cause is unknown because file-op failures are
  > not logged. Sandbox writeFile works in isolation, so the failure is
  > live/environmental. Separately, the chat panel treats ANY
  > {type:'error'} frame as a session error, so file read/save errors
  > (which carry a `path`) render as "Session error" AND disable the chat
  > input. Add file-op + handler logging, route file-scoped errors to the
  > editor, and root-cause the live write failure.
  **Acceptance criteria:**
  - Editing a file in Monaco and saving persists to the sandbox and reloads correctly after a page refresh (the STORY-10 AC, currently broken in prod).
  - A failed file read/save surfaces as an inline editor error (not a chat 'Session error') and never disables the chat input.
  - File-op failures (file_list/file_read/file_save) are logged server-side with the underlying error + sessionId/path context, so future bugs are diagnosable.
  **User flow:**
  1. Open a file in the editor, edit it, click Save
  2. Content persists to the sandbox and survives a page refresh
  3. If a save fails, an inline error shows by the Save button and the chat/session is unaffected
  **Out of scope:**
  - Multi-user concurrent-edit conflict resolution (Yjs, post-POC).
  - :white_check_mark: **TASK-069** — Orchestrator: log file-op failures with cause + sessionId/path context  `high` `small` _(services/orchestrator)_
    > Log the underlying error in handleFileSave/handleFileRead/
    > handleFileList (currently only file_list logs), plus a broader
    > catch-logging pass on orchestrator handlers. Include sessionId +
    > path context. This is the observability needed to diagnose the
    > live save failure and future bugs.
    _Task AC:_
    - Each file-op handler logs the underlying error (message + sessionId + path) on failure; verified by a unit test asserting the log call.
  - :white_check_mark: **TASK-070** :checkered_flag: — Deploy logging, reproduce the live save failure, root-cause + fix it  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-069_
    > With TASK-069 deployed, reproduce the edit-save failure on the live
    > VPS (agent creates a file, user edits + saves), capture the real
    > writeFile error from the logs, and fix the root cause. Confirm the
    > edit persists to the sandbox volume.
    _Task AC:_
    - The live save failure is reproduced, its cause captured in logs, and fixed; an edited file's new content is confirmed in the sandbox volume after save.
    - STORY-26 acceptance_criteria satisfied.
  - :white_check_mark: **TASK-071** :checkered_flag: — Web: route file errors to the editor, not the chat session  `high` `small` _(apps/web)_
    > Stop the chat panel treating file-scoped error frames (those
    > carrying a `path`) as session errors / disabling input. Surface
    > read/save failures inline in the CodeEditor (e.g. a save-failed
    > state by the Save button) via WorkspaceFilesProvider.
    _Task AC:_
    - A file_save/file_read error renders inline in the editor and leaves the chat connected + input enabled; covered by a component/unit test.

- **STORY-27** — Template seeding: mechanism + blank template + picker  [:white_check_mark: verified]
  > DockerSandbox.start only runs `git init` — it never copies template
  > files, so a new project's /workspace is empty. This story builds the
  > rails: a seeding mechanism (copy a chosen template into /workspace on
  > first start + initial commit), a `blank` template (truly empty — a
  > README only — for internal/open testing), a template registry, and a
  > create form that picks name + template. The react-threejs-scene content
  > is owned by STORY-14 and plugs into this mechanism (no duplication).
  > Subsumes STORY-29 (name on create) — the create form does name + template.
  **Acceptance criteria:**
  - Creating a project seeds the chosen template into /workspace on first start (blank → a README, otherwise empty), as the initial git commit; the file tree shows the seeded files.
  - The create flow takes a required name (sensible default) and a template choice (Blank / React + Three.js); both are stored and the name shows in the dashboard list.
  - An unknown templateId is rejected at the API; a populated/restored workspace is left untouched.
  **User flow:**
  1. Dashboard → New project → enter a name, pick a template
  2. Open the workspace — the file tree shows the seeded template files
  3. Open a seeded file in Monaco and edit it
  **Out of scope:**
  - The react-threejs-scene template content (STORY-14).
  - The Codex harness; per-template sandbox images.
  - :white_check_mark: **TASK-072** — Establish the blank template source (templates/blank)  `high` `small` _(apps/web)_
    > Add templates/blank — a truly-empty starter (a README only) for
    > internal/open testing. The seeding mechanism (TASK-073) copies it
    > into a fresh workspace; the rest of /workspace stays empty.
    _Task AC:_
    - templates/blank exists with a README and no app scaffold.
  - :white_check_mark: **TASK-073** :checkered_flag: — Sandbox: seed the chosen template into /workspace on first start (+ ADR)  `high` `medium` _(packages/sandbox, services/orchestrator)_  
    _depends on: TASK-072_
    > DockerSandbox gains a templatesDir config; on first start of a fresh
    > workspace, copy templatesDir/<templateId> into /workspace (docker cp,
    > Bun-safe) and make it the initial commit. Skip when the volume is
    > populated/restored or the templateId is unknown. Orchestrator passes
    > templatesDir + ships templates/ in its image. ADR for the mechanism.
    _Task AC:_
    - A fresh project seeds templatesDir/<templateId> into /workspace as the initial commit (Docker-gated test); populated/restored volumes untouched.
  - :white_check_mark: **TASK-078** :checkered_flag: — Template registry + create form (name + template) + POST validation  `high` `medium` _(apps/web)_
    > A web-side template registry (blank, react-threejs-scene: id + name +
    > description). Replace NewProjectButton with a create form collecting a
    > required name (default) + a template choice. POST /api/projects accepts
    > { name, templateId }, validates against the registry, and stores both
    > (drop the hardcoded TEMPLATE_ID). Subsumes STORY-29.
    _Task AC:_
    - Creating a project with a typed name + chosen template persists both; an unknown templateId is rejected; the name shows in the dashboard list.
    - STORY-27 acceptance_criteria satisfied.

- **STORY-28** — Dashboard project list: open & delete  [:white_check_mark: verified]
  > The dashboard renders only a 'New project' button — there is no list
  > query, no GET /api/projects, and no DELETE, so a user cannot return to
  > or remove a project. Projects are owned via the user's personal team.
  > Add a project list (open) and a delete that leaves no stale artifacts
  > (row + sessions + sandbox container/volume) while logging the
  > destructive action for traceability.
  **Acceptance criteria:**
  - The dashboard lists the signed-in user's projects, newest first, each opening its workspace.
  - Deleting a project (with confirmation) removes the project row, its sessions, AND its sandbox container + named volume — no stale artifacts — and the deletion is logged (who/what/when) for traceability.
  - An empty state is shown when the user has no projects.
  **User flow:**
  1. Sign in and open the dashboard
  2. See my projects listed (name + created date, newest first)
  3. Click a project to open its workspace
  4. Delete a project (with confirm) — it disappears from the list
  **Out of scope:**
  - Sharing / teams management UI.
  - Rename from the list (possible follow-up).
  - :white_check_mark: **TASK-074** — lib + API: list + delete projects (ownership-checked)  `high` `medium` _(apps/web)_  
    _depends on: TASK-075_
    > Add listUserProjects(userId) and deleteProject(userId, projectId)
    > to lib/projects.ts (team-membership ownership). Add GET /api/projects
    > (list) and DELETE /api/projects/[id] — the delete removes the row +
    > sessions and calls the orchestrator to destroy the sandbox, then
    > logs the deletion for traceability.
    _Task AC:_
    - GET returns only the caller's projects; DELETE is ownership-checked, removes row + sessions, triggers sandbox destroy, and logs the action; covered by tests.
  - :white_check_mark: **TASK-075** — Orchestrator + Sandbox: destroy a project's sandbox (container + volume) (+ ADR)  `high` `medium` _(services/orchestrator, packages/sandbox)_
    > Add a Sandbox method + orchestrator endpoint to fully remove a
    > project's sandbox: stop/remove the container and delete the named
    > volume praxis-project-<id> (and any object-store snapshot). ADR for
    > the Sandbox-interface addition. Log the destructive action.
    _Task AC:_
    - Destroying a project removes its container + named volume (and snapshot); Docker-gated integration test confirms no artifacts remain; action is logged.
  - :white_check_mark: **TASK-076** :checkered_flag: — Dashboard UI: project list with open + delete + empty state  `high` `medium` _(apps/web)_  
    _depends on: TASK-074_
    > Render the user's projects on the dashboard (name + created date,
    > newest first), each opening its workspace; a delete action with a
    > confirm step; an empty state when there are none.
    _Task AC:_
    - Dashboard lists projects (open), supports delete-with-confirm, and shows an empty state; verified in a browser drive.
    - STORY-28 acceptance_criteria satisfied.

## EPIC-07 — Project lifecycle v2 — manage, organize, and reuse projects

EPIC-06 made projects creatable, openable, and deletable. As a pair
accumulates projects, four lifecycle gaps now block real use: a bad
name can't be fixed, finished projects can't be set aside without
destructive deletion, a long dashboard list can't be searched, and a
project that worked can't be used as a starting point for the next.
This epic adds rename/describe, archive/restore, dashboard
search/sort/filter, and duplicate/fork — the last requiring an
addition to the Sandbox interface (ADR + sign-off).

- **STORY-39** — Rename and re-describe a project  [:white_check_mark: verified]
  > Add an editable description and make the project name editable
  > after creation — the metadata spine that the archive (STORY-40)
  > and dashboard search/sort (STORY-41) stories build on.
  **Acceptance criteria:**
  - A project row on the dashboard exposes an Edit action that reveals an inline form pre-filled with the current name and description.
  - Saving persists name + description via PATCH /api/projects/[id]; the row reflects the new name and description without a full page navigation (router.refresh()).
  - Save is disabled when the name is empty; name is capped at 120 chars, description at 280; both trimmed.
  - A non-owner (or signed-out) calling PATCH gets 403/401 and no row changes.
  - A failed save shows an inline error by the form and leaves the original values intact.
  **User flow:**
  1. On /dashboard, the owner clicks Edit on a project row
  2. The row swaps to an inline form: a name text input (pre-filled) + a short description textarea + Save / Cancel
  3. Owner edits, clicks Save (disabled while name empty or request pending)
  4. System PATCHes, on 2xx collapses the form and shows the updated name + description
  5. On error, an inline message appears and the form stays open with the entered values
  **Out of scope:**
  - Rich-text / markdown descriptions (plain text only).
  - Renaming from inside the workspace header (dashboard only this pass).
  - Edit history / audit UI of name changes.
  - :white_check_mark: **TASK-107** — db: add nullable description to projects (drizzle migration + codegen)  `high` `small` _(packages/db)_
    > Add a nullable `description` text column to the projects table.
    > Generate the drizzle migration, run codegen, update the @praxis/db
    > schema exports. `name` already exists.
    _Task AC:_
    - Migration adds a nullable description column; codegen drift check passes; existing rows read back null.
  - :white_check_mark: **TASK-108** — lib + API: PATCH /api/projects/[id] (name + description, ownership-checked)  `high` `small` _(apps/web)_  
    _depends on: TASK-107_
    > Add updateProject(userId, projectId, {name?, description?}) to
    > lib/projects.ts (ownership via userOwnsProject, trim, validate
    > name 1–120 / description ≤280), and a PATCH handler in
    > app/api/projects/[id]/route.ts returning the updated summary;
    > console.info({event:'project.updated'}).
    _Task AC:_
    - 401 unauth / 403 non-owner / 400 empty-or-overlong name / 200 with {id,name,description} on success; covered by route + lib tests.
  - :white_check_mark: **TASK-109** — lib + UI: surface description in ProjectSummary + inline edit form  `high` `small` _(apps/web)_  
    _depends on: TASK-108_
    > Extend ProjectSummary + listUserProjects to select description;
    > add a client EditProjectButton / inline form on the dashboard row
    > (matches the DeleteProjectButton client pattern; Save disabled on
    > empty/pending; router.refresh() on success).
    _Task AC:_
    - Edit reveals pre-filled fields; empty name disables Save; successful save shows the new name + description; covered by a component test.
  - :white_check_mark: **TASK-110** :checkered_flag: — e2e: rename round-trips  `med` `small` _(apps/web)_  
    _depends on: TASK-108, TASK-109_
    > Playwright — a signed-in user creates a project, edits its name +
    > description, and asserts the row updates and survives a reload.
    _Task AC:_
    - e2e passes asserting the updated name + description persist across a reload.
    - STORY-39 acceptance_criteria satisfied.

- **STORY-40** — Archive and restore a project  [:hourglass: pending]
  > A reversible alternative to delete: archiving removes a project from
  > the active list without touching its volume; restore brings it back.
  > Delete-with-cleanup (STORY-28) remains the only destructive path.
  **Acceptance criteria:**
  - Each active project row exposes an Archive action; archiving sets archived_at and removes the project from the default dashboard list immediately.
  - An Archived view (tab/section) lists archived projects with a Restore action that clears archived_at and returns them to the active list.
  - The default GET /api/projects (and listUserProjects) returns only active projects; an explicit ?status=archived|all returns the others.
  - Archiving does not destroy the sandbox/volume — the project's files survive and reopen after restore (the running container is left to the existing 30-min idle sweep).
  - Delete-with-cleanup (STORY-28) remains available for both active and archived projects.
  **User flow:**
  1. Owner clicks Archive on an active project row (lightweight confirm — it's reversible)
  2. The row disappears from the active list
  3. Owner switches to the Archived tab and sees it listed
  4. Owner clicks Restore — it returns to the active list, openable, files intact
  **Out of scope:**
  - Auto-archiving by inactivity (manual only this pass).
  - Forcibly destroying the sandbox container on archive (idle sweep handles it).
  - Bulk archive / multi-select.
  - :white_check_mark: **TASK-111** — db: add nullable archived_at timestamptz to projects  `high` `small` _(packages/db)_
    > Add a nullable archived_at timestamptz column; null = active.
    > Drizzle migration + codegen.
    _Task AC:_
    - Nullable column added; existing rows read null; drift check passes.
  - :white_check_mark: **TASK-112** — lib + API: archive/restore + status-filtered list  `high` `medium` _(apps/web)_  
    _depends on: TASK-111_
    > archiveProject/restoreProject(userId, projectId) (ownership-checked,
    > set/clear archived_at, console.info event); listUserProjects(userId,
    > {status}) defaults to active; GET /api/projects honors
    > ?status=active|archived|all; add archive + restore endpoints
    > (PATCH {archived:true|false} or POST).
    _Task AC:_
    - Archive sets the timestamp and drops the project from the default list; restore clears it; non-owner 403; covered by tests.
  - :white_check_mark: **TASK-113** — UI: archive/restore actions + Archived view  `high` `medium` _(apps/web)_  
    _depends on: TASK-112_
    > Archive action on active rows; an Active/Archived toggle on the
    > dashboard; Restore action on archived rows; empty states for each.
    _Task AC:_
    - Archiving removes the row from Active and shows it under Archived; restore reverses it; component test covers the toggle + actions.
  - :white_check_mark: **TASK-114** :checkered_flag: — e2e: archive then restore round-trips  `med` `small` _(apps/web)_  
    _depends on: TASK-112, TASK-113_
    > Create → archive (gone from Active, present in Archived) → restore
    > (back in Active, opens with files).
    _Task AC:_
    - e2e passes the full archive→restore round-trip.
    - STORY-40 acceptance_criteria satisfied.

- **STORY-41** — Dashboard search, sort, and filter  [:white_check_mark: verified]
  > Make a growing project list navigable: search by name, sort by
  > recent/oldest/name, and switch active vs archived. Builds on the
  > metadata (STORY-39) and the status filter (STORY-40).
  **Acceptance criteria:**
  - A search box filters the visible list by name (case-insensitive substring); clearing it restores the full list.
  - A sort control offers Recent (default), Oldest, and Name (A–Z); the order updates immediately.
  - The Active/Archived filter from STORY-40 composes with search + sort (search within the current tab).
  - A distinct no-match empty state ('No projects match …') is shown when search yields nothing, separate from the 'no projects yet' empty state.
  **User flow:**
  1. Owner lands on /dashboard with several projects (Recent order, Active tab)
  2. Types in the search box — list narrows live to name matches
  3. Picks Name from the sort control — list reorders A–Z
  4. Clears search — full current-tab list returns in the chosen sort
  **Out of scope:**
  - Full-text search over file contents or descriptions (name only).
  - Server-side pagination (client filter/sort is sufficient at POC scale).
  - Saved filters / per-user default sort persistence.
  - :white_check_mark: **TASK-115** — lib + API: sort param on the project list  `med` `small` _(apps/web)_
    > listUserProjects(userId, {status, sort}) supporting
    > recent|oldest|name, default recent, composing with status.
    _Task AC:_
    - Each sort returns the documented order; defaults to recent; covered by a lib test.
  - :white_check_mark: **TASK-116** :checkered_flag: — UI: search box + sort control + Active/Archived tabs  `med` `medium` _(apps/web)_  
    _depends on: TASK-115_
    > Add the search input, sort dropdown, and wire the tabs from
    > STORY-40; client-side filter/sort over the loaded list; no-match
    > empty state; note in code that filtering is client-side for small
    > lists.
    _Task AC:_
    - Typing narrows the list; sort reorders; no-match state renders; component test covers filter + sort + empty states.
    - STORY-41 acceptance_criteria satisfied.

- **STORY-42** — Duplicate / fork a project  [:white_check_mark: verified]
  > Use a finished project as the seed for a new one — clone its
  > /workspace contents AND git history into a fresh, independent
  > sandbox. Requires a new Sandbox-interface method (ADR + sign-off);
  > the only architecturally load-bearing story in the epic.
  **Acceptance criteria:**
  - A Duplicate action on a dashboard project creates a new, independent project (default name 'Copy of <name>') owned by the same team.
  - The duplicate's /workspace contains the same files and full git history as the source at duplication time; it opens to that state.
  - The two projects are fully independent — editing one does not change the other (separate sandbox volumes).
  - Cloning the source volume into the new project's volume goes through a new Sandbox-interface method (no Docker specifics leaked to consumers), introduced under an ADR with both-contributor sign-off.
  - A duplicate of a source whose sandbox has never started (no volume yet) falls back to seeding the source's template — it never produces an empty or errored project.
  **User flow:**
  1. Owner clicks Duplicate on a project row
  2. System creates the new project row and triggers the clone; the row shows a brief 'Duplicating…' state
  3. On success the new 'Copy of <name>' appears in the list, openable
  4. Opening it shows the same files + git log; edits there don't touch the original
  **Out of scope:**
  - Carrying over the live preview / running agent session / chat history (a fresh sandbox + fresh agent session).
  - Cross-team duplication or duplicating someone else's project.
  - Selective/partial duplication (always the whole workspace).
  - :white_check_mark: **TASK-117** — ADR + Sandbox interface: add clone capability  `high` `medium` _(packages/sandbox)_
    > ADR (Context/Decision/Consequences/Alternatives) for adding a
    > clone method to the Sandbox interface that copies a source
    > project's named volume contents (incl. .git) into a new
    > praxis-project-<newId> volume; define the method signature only,
    > no Docker types in the signature.
    _Task AC:_
    - ADR committed under docs/decisions/; interface gains the method with no Docker types in the signature; marked Proposed pending sign-off.
  - :white_check_mark: **TASK-118** — packages/sandbox: DockerSandbox clone implementation (Bun-safe)  `high` `medium` _(packages/sandbox)_  
    _depends on: TASK-117_
    > Implement the volume copy preserving git history via the docker
    > CLI / a helper container (Bun-safe per the dockerode rule).
    _Task AC:_
    - Docker-gated integration test (RUN_DOCKER_TESTS=1) asserts files + .git land in the new volume and the source is untouched.
  - :white_check_mark: **TASK-119** — orchestrator: fork endpoint (clone source → new project sandbox)  `high` `medium` _(services/orchestrator)_  
    _depends on: TASK-118_
    > Internal-secret-gated endpoint that clones a source project's
    > volume into a new project's volume and prepares it to start
    > (reusing the start/seed path; template-seed fallback when the
    > source has no volume). Logged.
    _Task AC:_
    - Endpoint clones source→new and returns ok; missing-volume source falls back to template seed; integration test (Docker job) covers both.
  - :white_check_mark: **TASK-120** — lib + API + UI: Duplicate action (create copy → clone → opens)  `high` `medium` _(apps/web)_  
    _depends on: TASK-119_
    > POST /api/projects/[id]/duplicate — ownership-checked, creates the
    > new project row (Copy of <name>, same team/template), calls the
    > orchestrator fork, logs project.duplicated; a DuplicateProjectButton
    > on the dashboard row with a pending state + router.refresh().
    _Task AC:_
    - 403 non-owner; success creates a new row and returns its id; UI shows 'Duplicating…' then the new row; route + component tests.
  - :white_check_mark: **TASK-121** :checkered_flag: — e2e: duplicate produces an independent copy  `med` `medium` _(apps/web)_  
    _depends on: TASK-119, TASK-120_
    > Create + seed a project, edit a file, Duplicate, open the copy,
    > assert the edited file is present, then assert editing the copy
    > doesn't change the original.
    _Task AC:_
    - e2e passes asserting the copy has the source's files and is independent of the original.
    - STORY-42 acceptance_criteria satisfied.

- **STORY-52** — Archived projects are read-only cold storage  [:white_check_mark: verified]
  > STORY-40 made archive/restore a reversible STATE change but left an
  > archived project fully interactive: it only sets archived_at (the
  > sandbox/volume are untouched, container left to the idle sweep), so a
  > user can still open an archived project, prompt the agent, and edit
  > files. Intended behaviour: an archived project is READ-ONLY and lives
  > in COLD STORAGE — its container is torn down on archive and its files
  > are preserved as a snapshot to rebuild from; restore rebuilds the
  > sandbox and makes it interactive again. This story makes that real.
  > SUPERSEDES STORY-40's out_of_scope item "Forcibly destroying the
  > sandbox container on archive (idle sweep handles it)".
  **Acceptance criteria:**
  - Opening an archived project is read-only: POST /sessions is refused for an archived project (no agent prompts run, no file saves), and the UI clearly shows the project is archived / read-only with a Restore path.
  - On archive the project's sandbox container is torn down (not left to the idle sweep) and its files are preserved (Docker volume on the single-VPS POC; a durable MinIO snapshot per ADR-0008 once the object store is provisioned — see STORY-53) so the project can be rebuilt from them.
  - On restore the sandbox is rebuilt and the project becomes interactive again with files intact (start() reuses the persisted volume, or restores from the MinIO snapshot when the volume is empty and the object store is configured).
  - STORY-40's archive/restore state transitions + status-filtered dashboard listing continue to work; delete-with-cleanup (STORY-28) remains available.
  **User flow:**
  1. Owner archives a project → its container is torn down; files snapshot to cold storage
  2. Owner opens the archived project → a read-only/archived view; the agent + file edits are disabled, with a Restore action
  3. Owner clicks Restore → the sandbox rebuilds from the snapshot, files intact, fully interactive again
  **Out of scope:**
  - Auto-archiving by inactivity (still manual).
  - A read-only file BROWSER beyond what the existing workspace renders (this pass blocks interaction; a polished archived viewer can come later).
  - Changing the snapshot/restore mechanism itself (ADR-0008 MinIO) beyond tearing down on archive + refusing to start while archived.
  - :white_check_mark: **TASK-157** — Guard: refuse sessions + prompts + file saves for archived projects (read-only)  `high` `medium` _(apps/web, services/orchestrator)_
    > Block interaction with an archived project. Web: POST /api/sessions
    > returns a clear 'archived' error when projects.archived_at is set;
    > the workspace surfaces a read-only/archived state with a Restore
    > path. Orchestrator: defense-in-depth — refuse session creation (and
    > reject prompts / file_save frames) for an archived project.
    _Task AC:_
    - Archived project: POST /sessions refused; prompt + file-save rejected; UI shows read-only + Restore; tests.
  - :white_check_mark: **TASK-158** — Archive tears down the container to cold storage; restore rebuilds  `high` `medium` _(services/orchestrator, packages/sandbox)_  
    _depends on: TASK-157_
    > On archive, snapshot the sandbox to MinIO (ADR-0008) and destroy the
    > running container (cold storage — no live container for an archived
    > project). On restore, the existing start() path rebuilds from the
    > snapshot when the volume is empty. Wire archive/restore (apps/web
    > archiveProject/restoreProject) to an orchestrator endpoint that
    > performs the snapshot + teardown / rebuild.
    _Task AC:_
    - After archive: no running container; files snapshotted. After restore: container rebuilt, files intact. Integration test (Docker-gated).
  - :white_check_mark: **TASK-159** :checkered_flag: — e2e/integration: archived is read-only; restore rebuilds with files intact  `med` `small` _(apps/web)_  
    _depends on: TASK-157, TASK-158_
    > Archive a seeded project → opening it is read-only (no agent, no
    > edits) and the container is gone → restore → interactive again with
    > files intact.
    _Task AC:_
    - e2e/integration proves archived read-only + cold-storage teardown + restore-rebuilds-with-files.
    - STORY-52 acceptance_criteria satisfied.
  - :white_check_mark: **TASK-160** — Archived projects: drop the redundant Open button + non-clickable name  `low` `small` _(apps/web)_  
    _depends on: TASK-157_
    > Post-merge UX follow-up surfaced during STORY-52 live verification:
    > an archived project can't be opened (opening only renders the restore
    > prompt), so the dashboard's Open button and the clickable project-name
    > link are redundant for archived rows. Hide both for archived projects
    > so Restore is the only way back in; active rows are unchanged.
    _Task AC:_
    - Archived rows render no Open button and a non-clickable name; active rows keep both. Unit test in project-list.test.tsx.

- **STORY-53** — Provision the MinIO object store for durable sandbox snapshots
  > Sandbox persistence in prod is currently VOLUME-ONLY: MinIO is not
  > provisioned (no MINIO_* env), so DockerSandbox.stop() skips the
  > snapshot and ADR-0008's durable cold storage never engages. This is
  > the documented degraded default — fine day-to-day on the single VPS
  > (volumes persist across restarts/deploys; the hygiene volume-prune is
  > DB-guarded, so archived/active volumes are safe) — but project files
  > survive only as long as the VPS disk does. A rebuild or disk loss
  > wipes every project with no off-host copy, and the archived "cold
  > storage" of STORY-52 AC#2 is volume-only rather than a true snapshot.
  > 
  > Provision MinIO so stop()/idle-sweep/archive actually snapshot and
  > start() can restore from object storage. NO APPLICATION CODE CHANGE is
  > needed — getSandbox() builds the store from MINIO_* via fromEnv(); this
  > is operator + verification work. To deliver real durability (not a
  > same-disk copy) the bucket SHOULD live on separate/backed-up storage.
  > Also unblocks multi-host / non-Docker sandboxes later (a fresh host has
  > no local volume and must restore from the snapshot).
  **Acceptance criteria:**
  - MinIO (or an S3-compatible bucket) is reachable from the orchestrator on praxis-net, with MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET set in the prod env (praxis.env) and the orchestrator restarted to pick them up.
  - Bucket storage is durable independent of the app VPS disk (separate volume/host or external S3), so a VPS rebuild does not lose snapshots — otherwise it is only a same-disk copy and provides no real DR.
  - Live round-trip verified on the VPS: archive (or idle-sweep) a project → a snapshot object exists in the bucket; remove the local volume → reopen → start() restores /workspace from the snapshot with files intact.
  - STORY-52 AC#2/#3 are then satisfied in the strong (MinIO snapshot) sense, not just volume-only; secret handling follows the no-platform-creds-in-sandbox rule (MINIO_* live only in prod env, never in /workspace or sandbox env).
  **User flow:**
  1. Operator stands up the MinIO bucket on durable storage, adds MINIO_* to praxis.env, restarts the orchestrator
  2. A project is archived/idle → its /workspace is snapshotted to the bucket
  3. Even after the local volume is gone (host rebuild), reopening the project restores files from the snapshot
  **Out of scope:**
  - Swapping the ObjectStore backend implementation (S3/GCS adapters) — a new ObjectStore impl + env, separate work.
  - Periodic/scheduled snapshotting beyond the existing stop()/idle-sweep/archive trigger points.
  - Reclaiming the local volume on archive (current teardown keeps it; revisit only if disk pressure warrants).
  - :black_circle: **TASK-161** :checkered_flag: — Provision MinIO in prod and verify a live snapshot/restore round-trip  `med` `medium` _(infrastructure/deploy)_
    > Operator-led: run a MinIO container on praxis-net (or point at an
    > external S3 bucket) backed by storage independent of the app VPS
    > disk; create the bucket; add MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/
    > BUCKET to praxis.env (ASCII-only, no inline comments); restart the
    > orchestrator. Then verify live: archive a project, confirm a
    > snapshot object lands in the bucket, remove the local volume,
    > reopen, and confirm start() restores /workspace with files intact.
    > Record the bootstrap in the orchestrator runbook's Setup history.
    > No application code change — fromEnv() already builds the store.
    _Task AC:_
    - MINIO_* set in prod, orchestrator restarted, and a live archive→snapshot→volume-loss→restore round-trip verified on the VPS with files intact; bucket storage is independent of the app VPS disk; runbook Setup history updated.

## EPIC-08 — Admin console: accountability & moderation

Extends the EPIC-05 admin shell (STORY-20/21) from a single API-key page
into a real admin console. Today admins cannot see other users' projects,
administer users, ban abusers, or answer "what happened" (destructive
actions only console.info to stdout; the events table is chat-only). This
epic adds a queryable audit trail, an all-projects directory with
moderation, user administration with roles, bans + an email/domain
blocklist, an activity-log viewer, and a health overview. Every
/api/admin/* route is role-gated server-side; admin actions never widen the
ownership helpers; destructive actions require a reason and are audit-logged.

- **STORY-43** — Audit log foundation  [:white_check_mark: verified]
  > The accountability backbone — a queryable audit_log every
  > admin/destructive action writes to. Plumbing only; the viewer is a
  > later story (STORY-47).
  **Acceptance criteria:**
  - A new audit_log row is written for every wired action (project.deleted/archived/restored/updated/duplicated, api_key.rotated), capturing actorUserId, action, targetType, targetId, metadata jsonb, ip, and createdAt.
  - Audit rows are queryable by actor, by target (type+id), and by time range via a lib helper.
  - Existing console.info stdout logs are preserved (the audit row is added, not a replacement).
  **Out of scope:**
  - The audit viewer UI (STORY-47).
  - Retention / rotation / archival of audit rows.
  - Backfilling historical actions that predate this table.
  - :white_check_mark: **TASK-122** — db: audit_log table + audit_action enum + migration + codegen  `high` `small` _(packages/db)_
    > Add audit_log (id uuid pk, actor_user_id uuid fk users, action
    > audit_action enum, target_type text, target_id text, metadata
    > jsonb, ip text nullable, created_at timestamptz default now). A
    > pgEnum audit_action covers the wired actions with room to grow.
    > drizzle migration + db:codegen.
    _Task AC:_
    - Migration creates audit_log + the audit_action enum; codegen regenerates types; existing rows unaffected.
  - :white_check_mark: **TASK-123** — lib: recordAudit() helper + wire existing web emissions  `high` `medium` _(apps/web)_  
    _depends on: TASK-122_
    > recordAudit(actorUserId, action, {targetType, targetId, metadata,
    > ip}) inserts a row (injectable db for tests). Wire the existing
    > console.info emission sites (project [id] route delete/patch
    > archive+restore+update, duplicate route, admin api-keys rotate) to
    > also call recordAudit. Non-fatal: an audit insert failure logs but
    > does not break the action.
    _Task AC:_
    - Each wired action persists an audit_log row with the correct action+target+actor; an audit failure does not 500 the action; covered by tests.
  - :white_check_mark: **TASK-124** :checkered_flag: — test: real-Postgres integration for recordAudit + query helpers  `med` `small` _(apps/web)_  
    _depends on: TASK-123_
    > RUN_DB_TESTS=1 integration — recordAudit writes; query-by-actor /
    > target / time returns the expected rows.
    _Task AC:_
    - Integration test asserts persistence + the three query dimensions.
    - STORY-43 acceptance_criteria satisfied.

- **STORY-44** — Admin projects directory + moderation  [:white_check_mark: verified]
  > An admin sees every project (any owner) and can archive/delete any of
  > them, audit-logged with a reason.
  **Acceptance criteria:**
  - An admin sees every project regardless of ownership with owner, members, status (active/archived), created, and last activity; the list is searchable by name/owner and sortable.
  - An admin can archive or delete ANY project from the admin UI with a required reason; it performs the same cleanup as the owner path (delete destroys the sandbox) and writes an audit_log row.
  - All /api/admin/projects* routes return 403 for non-admins and never widen the ownership helpers.
  **User flow:**
  1. Admin opens /admin -> Projects
  2. Sees a searchable/sortable table of all projects (owner, members count, status, last activity)
  3. Opens a project -> detail (members, sessions, recent activity)
  4. Archives or deletes it with a confirm + reason; the row updates and the action is audited
  **Out of scope:**
  - Editing project content/files as admin.
  - Transferring ownership between teams.
  - Bulk actions / multi-select.
  - :white_check_mark: **TASK-125** — lib + API: GET /api/admin/projects (all projects + owner + members + status)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/329)
    > adminListProjects() joins projects -> teams (owner via createdBy)
    > -> teamMemberships (members) -> latest activity (sessions/events).
    > GET /api/admin/projects role-gated via isUserAdmin; supports ?q and
    > ?sort.
    _Task AC:_
    - 200 for admin returns all projects with owner+members+status; 403 for non-admin; covered by tests.
  - :white_check_mark: **TASK-126** — lib + API: admin archive/delete any project (audit-logged, reason)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/329)  
    _depends on: TASK-123, TASK-125_
    > New role-authorized PATCH+DELETE /api/admin/projects/[id] that
    > bypass ownership (admin authz, NOT userOwnsProject) and reuse
    > setProjectArchived/deleteProject internals + the orchestrator
    > destroy; require a reason; recordAudit.
    _Task AC:_
    - Admin archives/deletes a non-owned project; reason required; audit row written; 403 for non-admin; tests.
  - :white_check_mark: **TASK-127** — UI: /admin/projects table + project detail  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/329)  
    _depends on: TASK-125_
    > /admin/projects searchable/sortable table; /admin/projects/[id]
    > detail (members, sessions, recent activity) with archive/delete
    > actions (confirm + reason).
    _Task AC:_
    - Table lists all projects, search+sort work; detail shows members+activity; actions call the admin endpoints; component tests.
  - :white_check_mark: **TASK-128** :checkered_flag: — e2e: admin lists all projects + archives one  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/329)  
    _depends on: TASK-126, TASK-127_
    > Admin signs in, opens /admin/projects, sees a project owned by
    > another user, archives it with a reason; asserts it moves to
    > archived + an audit entry exists.
    _Task AC:_
    - e2e passes the admin archive-with-reason flow.
    - STORY-44 acceptance_criteria satisfied.

- **STORY-45** — Admin users directory + role management  [:white_check_mark: verified]
  > List/search all users, view a user's detail, and manage admin roles
  > with safety guards.
  **Acceptance criteria:**
  - An admin lists and searches all users (email, role, created, project count, banned status) and opens a user detail showing their teams/projects, sessions, and recent activity.
  - An admin promotes/demotes a user's role; the system blocks self-demotion and blocks removing the last remaining admin; every role change is audit-logged.
  - All /api/admin/users* routes are 403 for non-admins.
  **User flow:**
  1. Admin opens /admin -> Users
  2. Searches/sorts the user list
  3. Opens a user -> detail (projects, sessions, activity, role, banned status)
  4. Promotes or demotes their role (guarded); the change is audited
  **Out of scope:**
  - Creating users / editing profile fields (name, email).
  - Ban/unban (STORY-46).
  - :white_check_mark: **TASK-129** — lib + API: GET /api/admin/users + GET /api/admin/users/[id] detail  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/330)
    > adminListUsers() (email, role, createdAt, project count, bannedAt)
    > with ?q; adminGetUser(id) detail (teams/projects, sessions, recent
    > audit/activity). Role-gated.
    _Task AC:_
    - List returns all users w/ counts; detail returns the user's projects+activity; 403 non-admin; tests.
  - :white_check_mark: **TASK-130** — lib + API: role promote/demote with guards (audit-logged)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/330)  
    _depends on: TASK-123, TASK-129_
    > PATCH /api/admin/users/[id] {role}; reject self-demotion and
    > last-admin removal (count admins); recordAudit.
    _Task AC:_
    - Promote/demote works; self-demote 4xx; demoting the last admin 4xx; audit row; tests.
  - :white_check_mark: **TASK-131** — UI: /admin/users list + user detail  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/330)  
    _depends on: TASK-129_
    > /admin/users searchable list; /admin/users/[id] detail with role
    > control (guarded) + sections for projects/sessions/activity.
    _Task AC:_
    - List searches; detail renders sections; role control calls the endpoint and reflects guards; component tests.
  - :white_check_mark: **TASK-132** :checkered_flag: — e2e: list users + promote/demote with guard  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/330)  
    _depends on: TASK-130, TASK-131_
    > Admin lists users, promotes a user to admin, then is blocked from
    > demoting themselves / the last admin.
    _Task AC:_
    - e2e passes promote + guard.
    - STORY-45 acceptance_criteria satisfied.

- **STORY-46** — Ban users + email/domain blocklist  [:white_check_mark: verified]
  > Soft-ban abusive users (revoke sessions + block sign-in) and block
  > emails/domains at the magic-link gate.
  **Acceptance criteria:**
  - An admin bans a user with a reason; their active sessions are revoked (authSession rows deleted) and any future magic-link sign-in is rejected with a clear message; unban restores access.
  - An admin adds an email or domain to a blocklist; a matching address cannot request a magic link or sign up (blocked at the sendMagicLink gate, apps/web/lib/auth.ts), with a friendly message; admins can manage (list/add/remove) entries.
  - Admins cannot ban themselves or the last remaining admin; ban/unban and blocklist changes are audit-logged.
  **User flow:**
  1. Admin opens a user detail -> Ban (reason); the user is signed out everywhere and can't sign back in
  2. Admin opens /admin/blocklist -> adds an email or domain
  3. A blocklisted person requesting a link sees a friendly 'not permitted' message and no email is sent
  4. Admin removes the entry / unbans to restore access
  **Out of scope:**
  - Appeals workflow / user-facing ban notices beyond the sign-in message.
  - Timed/temporary bans; IP-based blocking.
  - Rate-limiting (separate concern).
  - :white_check_mark: **TASK-133** — db: users.banned_at + ban_reason; email_blocklist table + migration + codegen  `high` `small` _(packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/332)
    > ALTER users ADD banned_at timestamptz, ban_reason text; new
    > email_blocklist (id, value text unique [email or domain], is_domain
    > boolean, reason text, added_by uuid fk users, created_at).
    > migration + codegen.
    _Task AC:_
    - Columns + table added (nullable/clean); codegen; existing rows unaffected.
  - :white_check_mark: **TASK-134** — auth: enforce ban + blocklist at the magic-link gate + revoke sessions on ban  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/332)  
    _depends on: TASK-133_
    > In sendMagicLink (auth.ts) reject blocklisted email/domain + banned
    > users before sending (friendly error, no email). On ban, delete the
    > user's authSession rows. Add a banned check on session resolution
    > so a live session can't act post-ban.
    _Task AC:_
    - Blocklisted email -> no link sent + friendly error; banned user's sessions deleted and sign-in rejected; covered by tests.
  - :white_check_mark: **TASK-135** — lib + API: ban/unban + blocklist CRUD (guards, audit-logged)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/332)  
    _depends on: TASK-133, TASK-123_
    > PATCH /api/admin/users/[id] {banned, reason} with self/last-admin
    > guards; /api/admin/blocklist GET/POST/DELETE. recordAudit on all.
    _Task AC:_
    - Ban/unban + blocklist CRUD work; self/last-admin ban 4xx; audit rows; 403 non-admin; tests.
  - :white_check_mark: **TASK-136** — UI: ban/unban on user detail + /admin/blocklist CRUD  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/332)  
    _depends on: TASK-135_
    > Ban/unban control (reason) on the user detail; /admin/blocklist
    > page to list/add/remove entries.
    _Task AC:_
    - Ban control calls the endpoint w/ reason; blocklist page CRUD works; component tests.
  - :white_check_mark: **TASK-137** :checkered_flag: — e2e: banned user can't sign in; blocklisted email can't request a link  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/332)  
    _depends on: TASK-134, TASK-135, TASK-136_
    > Admin bans a user -> that user's new magic-link sign-in is
    > rejected; admin blocklists an email -> requesting a link for it
    > sends nothing and shows the friendly message.
    _Task AC:_
    - e2e passes both enforcement paths.
    - STORY-46 acceptance_criteria satisfied.

- **STORY-47** — Audit log viewer  [:white_check_mark: verified]
  > The logging UI — a queryable, filterable view over audit_log.
  **Acceptance criteria:**
  - /admin/activity lists audit entries newest-first with filters for actor, target type/id, action, and time range, plus pagination.
  - Project and user detail pages (STORY-44/45) link to their scoped audit view (pre-filtered by target).
  - A no-match state is shown distinctly from an empty (no audit yet) state.
  **User flow:**
  1. Admin opens /admin -> Activity
  2. Filters by actor / action / target / time; the list updates
  3. From a project or user detail, clicks 'View activity' -> /admin/activity pre-filtered to that target
  **Out of scope:**
  - CSV/JSON export.
  - Real-time streaming / live tail.
  - Editing or deleting audit entries (append-only).
  - :white_check_mark: **TASK-138** — lib + API: GET /api/admin/audit with filters + pagination  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/334)  
    _depends on: TASK-122_
    > adminQueryAudit({actor, targetType, targetId, action, from, to,
    > limit, offset}) + GET /api/admin/audit role-gated; joins actor
    > email for display.
    _Task AC:_
    - Filters compose; pagination works; 403 non-admin; tests.
  - :white_check_mark: **TASK-139** :checkered_flag: — UI: /admin/activity table + filters + scoped links  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/334)  
    _depends on: TASK-138_
    > /admin/activity filterable table; add 'View activity' links on
    > project/user detail pages that deep-link with target filters; empty
    > vs no-match states.
    _Task AC:_
    - Filters narrow the list; scoped deep-links work; both empty states render; component test.
    - STORY-47 acceptance_criteria satisfied.

- **STORY-48** — Admin overview / platform health  [:white_check_mark: verified]
  > Replace the placeholder admin landing with a live health + activity
  > overview.
  **Acceptance criteria:**
  - /admin landing shows live counts: users, projects (active/archived), running sandboxes (from the orchestrator), platform-key status per provider, and the most recent admin actions.
  - If the orchestrator is unreachable, the sandbox/health tiles degrade gracefully (show 'unavailable') without breaking the page.
  **User flow:**
  1. Admin opens /admin and sees the overview dashboard with counts, key status, running sandboxes, and recent activity
  2. Clicks through tiles to the relevant section (projects / users / activity / api-keys)
  **Out of scope:**
  - Historical charts / time-series.
  - Alerting / notifications / paging.
  - :white_check_mark: **TASK-140** — orchestrator: internal endpoint for running-sandbox count + health  `high` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/335)
    > Internal-secret-gated GET /admin/stats (or extend health)
    > returning running sandbox count (DockerSandbox label listing) +
    > gitSha/uptime.
    _Task AC:_
    - Endpoint returns the running-sandbox count behind the internal secret; unit/integration test.
  - :white_check_mark: **TASK-141** — lib + API: GET /api/admin/overview (counts + key status + recent actions)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/335)  
    _depends on: TASK-140, TASK-122_
    > Aggregate user/project counts, platform-key meta per provider,
    > recent audit rows; call the orchestrator stats endpoint (tolerate
    > failure).
    _Task AC:_
    - Returns counts+key status+recent actions; orchestrator-down yields a degraded field not a 500; 403 non-admin; tests.
  - :white_check_mark: **TASK-142** :checkered_flag: — UI: replace /admin landing with the overview dashboard  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/335)  
    _depends on: TASK-141_
    > Replace the placeholder SECTIONS landing with tiles (counts,
    > running sandboxes, key status per provider, recent admin actions)
    > linking to sections; graceful 'unavailable' tiles.
    _Task AC:_
    - Landing renders live tiles; degrades gracefully when orchestrator stats absent; component test.
    - STORY-48 acceptance_criteria satisfied.

## EPIC-09 — Platform configuration & cost

The platform-config half of the admin console: an admin-wide usage & cost
dashboard (built on the EPIC-05 metering stories) and an admin-managed MCP
connector registry (replacing today's static .mcp.json/template config).
Multi-provider platform keys (STORY-38) and usage metering + budget caps
(STORY-22/23) already exist as `ready` stories in EPIC-05 — build those in
place; this epic depends on them and adds the admin-wide surfaces. MCP
changes are ADR-gated (AGENTS.md) — the connector story leads with an ADR
requiring both-contributor sign-off before implementation.

- **STORY-49** — Admin usage & cost dashboard  [:white_check_mark: verified]
  > An admin-wide view of platform spend + per-project/user usage, on top
  > of STORY-22's usage_events. Build STORY-22/23 (EPIC-05) first.
  **Acceptance criteria:**
  - /admin/usage shows aggregate spend against the platform key and per-project and per-user usage (tokens + cost estimate) over a selectable time window, reflecting real recorded usage_events (STORY-22).
  - The dashboard surfaces the per-project budget caps (STORY-23) and lets an admin set/adjust a cap.
  - Route is 403 for non-admins.
  **User flow:**
  1. Admin opens /admin -> Usage
  2. Picks a time window; sees total spend + top projects/users by usage
  3. Opens a project's usage and sets/adjusts its budget cap
  **Out of scope:**
  - Building the metering pipeline or usage_events table (STORY-22) or the cap engine (STORY-23) — this consumes them.
  - Invoicing / billing / payment.
  - :white_check_mark: **TASK-143** — lib + API: admin usage aggregation (GET /api/admin/usage)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/341)
    > Aggregate usage_events (STORY-22) by project + user + total over a
    > window; include platform-key spend estimate. Role-gated. NOTE:
    > depends on STORY-22's usage_events table existing (EPIC-05) — build
    > that first.
    _Task AC:_
    - Returns windowed totals + per-project/user breakdown; 403 non-admin; tests (gated on usage_events).
  - :white_check_mark: **TASK-144** :checkered_flag: — UI: /admin/usage dashboard + budget-cap setter  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/341)  
    _depends on: TASK-143_
    > /admin/usage with a window picker, totals, top projects/users, and
    > an admin budget-cap setter (writes the STORY-23 cap).
    _Task AC:_
    - Dashboard renders real usage; window picker works; cap setter persists; component test.
    - STORY-49 acceptance_criteria satisfied.
  - :white_check_mark: **TASK-145** :checkered_flag: — test: real-Postgres integration for usage aggregation  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/341)  
    _depends on: TASK-143_
    > Seed usage_events, assert aggregation by project/user/window.
    _Task AC:_
    - Integration asserts correct aggregates by project/user/window.

- **STORY-50** — MCP connector configuration  [:white_check_mark: verified]
  > An admin-managed registry of MCP connectors (enable/disable, encrypted
  > credentials, usage caps) replacing static config. ADR-GATED — the first
  > task is the ADR; implementation waits on both-contributor sign-off.
  **Acceptance criteria:**
  - An ADR proposes the admin-managed MCP connector model (registry shape, credential storage via @praxis/crypto, enable/disable, usage caps, orchestrator rendering) — Status Proposed, requiring both-contributor sign-off before implementation.
  - An admin manages connectors (list, enable/disable, set per-connector credentials encrypted at rest, set usage caps); changes are audit-logged.
  - At sandbox start the orchestrator renders each project's .mcp.json + Claude settings from the ENABLED registry and delivers credentials via the ephemeral-file pattern (outside /workspace).
  - A configured+enabled connector is reachable by the sandbox agent (verified at the Docker/integration layer).
  **User flow:**
  1. Admin opens /admin -> Connectors
  2. Adds a connector to the catalog (credential + usage cap), then enables it per template with the allowed commands (ADR-0020)
  3. A new project of that template starts with the connector wired; the agent can use the allowed commands
  **Out of scope:**
  - A public connector marketplace.
  - Arbitrary user-supplied MCP servers (admin-curated only).
  - Changing the ACP host or Path-A wiring beyond what the ADR approves.
  - :white_check_mark: **TASK-146** — ADR: admin-managed MCP connector registry (Proposed — both-contributor sign-off)  `high` `medium` _(packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/342)
    > Write the ADR (Context/Decision/Consequences/Alternatives) for the
    > registry shape, credential storage (@praxis/crypto), enable/disable,
    > usage caps, and orchestrator rendering of .mcp.json/settings from
    > the registry (ADR-0018 Path A compatible). Status Proposed;
    > implementation tasks must NOT start until both contributors sign
    > off. (Docs-only change under docs/decisions/.)
    _Task AC:_
    - ADR committed under docs/decisions/ as Proposed, covering registry + creds + rendering + caps.
  - :white_check_mark: **TASK-147** — db: mcp_connectors table + migration + codegen  `high` `small` _(packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/344)  
    _depends on: TASK-146_
    > Per ADR-0020 (per-template), TWO tables: mcp_connectors catalog
    > (id, name unique, command_ref text, args jsonb,
    > credentials_encrypted text nullable, usage_cap int nullable,
    > created_by uuid, created_at) + template_mcp_connectors
    > (template_id text, connector_id uuid, enabled boolean default
    > false, allowed_commands jsonb nullable, pk(template_id,
    > connector_id)). migration + codegen.
    _Task AC:_
    - Table added; codegen; clean.
  - :white_check_mark: **TASK-148** — orchestrator: render .mcp.json + settings from the enabled registry  `high` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/345)  
    _depends on: TASK-147_
    > At sandbox start, read enabled connectors and write the project's
    > .mcp.json + Claude settings (enableAllProjectMcpServers / list) and
    > deliver credentials via the ephemeral-file pattern outside
    > /workspace (orchestrator-runtime.md).
    _Task AC:_
    - A fresh sandbox gets .mcp.json from the enabled registry; creds delivered outside /workspace; integration test.
  - :white_check_mark: **TASK-149** — lib + API + UI: /admin/connectors CRUD (creds via crypto, caps, audit-logged)  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/344)  
    _depends on: TASK-147, TASK-123_
    > Admin CRUD for connectors — enable/disable, set credentials
    > (encrypt via @praxis/crypto), set usage cap; role-gated;
    > recordAudit. /admin/connectors UI.
    _Task AC:_
    - CRUD works; credentials encrypted at rest + never returned plaintext; audit rows; 403 non-admin; tests.
  - :white_check_mark: **TASK-150** :checkered_flag: — integration: a configured connector reaches the sandbox agent  `med` `medium` _(services/orchestrator)_ · [PR](https://github.com/g-chappell/praxis/pull/345)  
    _depends on: TASK-148, TASK-149_
    > Docker-gated — enable a connector, start a sandbox, assert the
    > agent sees it (.mcp.json present + server resolvable).
    _Task AC:_
    - Docker-gated integration confirms the enabled connector is wired into the sandbox.
    - STORY-50 acceptance_criteria satisfied.

## EPIC-10 — Teams & profiles — manage your pair

Praxis is a two-person workspace, but the team-as-shared-workspace model
is invisible and unmanaged: teams were auto-created ("Personal"), invites
silently added members with full access to ALL the team's projects, and
there was no UI to see members, remove them, rename the team, or edit your
own profile. In prod this let one team accumulate 3 members unnoticed.
This epic makes the pair explicit and owner-controlled (hard cap of 2),
adds a minimal user profile, and corrects admin attribution so sessions
and projects reflect REAL participation + ownership, not bare membership.

- **STORY-54** — Create and manage your team  [:white_check_mark: verified]
  > Make teams explicit. Today a "Personal" team is silently auto-created
  > on first project; this removes that — a user must deliberately create a
  > named team to build, or join someone else's via invite. The owner can
  > see the team's members (owner/partner badges + joined date) and rename
  > it. Foundation for the rest of EPIC-10. NOTE: this couples to project
  > creation — with no auto-create, creating a project requires an existing
  > team, so the create flow now instructs a teamless user to make/join one.
  **Acceptance criteria:**
  - A signed-in user with no team sees an empty Team section on /settings instructing them to create a team (with a name) to start building, or join another user's team via an invite link; teams are NOT auto-created.
  - Creating a team (non-empty name, <=60 chars) makes the creator its owner; a user already in a team cannot create a second one (one team per user this pass).
  - Attempting to create a project while in no team is refused and the UI tells the user to create or join a team first (no project and no team are silently created).
  - The owner sees the team name as editable and can rename it (persisted, audit-logged team.renamed); a non-owner sees the name read-only. Both see the member list with an owner badge, partner (if any), and each member's joined date.
  - Empty/whitespace names are rejected on create and rename (Save disabled + inline error); server 403s a non-owner rename and 409s a duplicate-team create.
  **User flow:**
  1. New user (no team) opens /settings -> Team section shows empty state: 'You don't have a team yet. Create one to start building, or ask a teammate for an invite link.'
  2. User clicks 'Create team', enters a name, Submit -> team created, they're shown as owner; they can now create projects
  3. Teamless user instead clicks 'New project' -> blocked with the same create-or-join-a-team guidance
  4. Owner opens /settings later -> Team card shows editable name + member list (owner badge, partner, joined dates); edits name, Save -> 'Saving...' -> name updates
  5. Partner (non-owner) opens /settings -> sees team name read-only + member list
  **Out of scope:**
  - Inviting / removing members and leaving a team (STORY-55) — this pass shows members and the empty-state mentions invites but builds no invite/remove controls
  - Editing your own display name / profile (a later story)
  - Fixing admin session/project attribution (a later story)
  - More than one team per user, transferring ownership, deleting a team, team avatars
  - :white_check_mark: **TASK-162** — lib + API: create / get / rename team (one-team-per-user, owner-gated rename)  `high` `medium` _(apps/web, packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/374)
    > createTeam(userId, name): 409 if the user is already in a team; else
    > insert team (name, createdBy=userId) + owner team_membership; return
    > it. getTeamForUser(userId) -> {id, name, isOwner, members:[{userId,
    > email, displayName, isOwner, joinedAt}]} | null. renameTeam(userId,
    > teamId, name): owner-gated (403 otherwise), trim, non-empty, <=60;
    > audit recordAudit('team.renamed'). Routes: POST /api/teams,
    > PATCH /api/teams/:id. No schema change (teams.name exists).
    _Task AC:_
    - createTeam returns 409 when the user already belongs to a team; on success the creator is the owner member
    - renameTeam returns 403 for a non-owner and 400 for empty/>60-char names; writes a team.renamed audit row on success
    - getTeamForUser returns null when the user has no team, else the team + members with isOwner/joinedAt
  - :white_check_mark: **TASK-163** — Require an explicit team to create a project (remove auto-create)  `high` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/374)
    > Remove the ensurePersonalTeam auto-create from POST /api/projects;
    > when the user has no team, return 409 {error:'needs_team'} and create
    > nothing. When they have one, create the project under it.
    > Update/retire ensurePersonalTeam in lib/projects.ts.
    _Task AC:_
    - POST /api/projects with no team returns 409 needs_team and creates neither a team nor a project
    - POST /api/projects with a team creates the project under that team
  - :white_check_mark: **TASK-164** — Settings UI: Team card — empty/create state, member list, owner rename  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/374)  
    _depends on: TASK-162_
    > Add a Team card to /settings. No team -> empty state with a
    > Create-team inline form (mirrors EditProjectButton pattern: inline
    > input, inline text-destructive error, 'Creating...' pending,
    > router.refresh). Has team -> member list (owner badge, partner,
    > joined date) + editable name for the owner / read-only for non-owner.
    > Testids: team-card, team-create-form, team-name-input,
    > team-create-submit, team-rename-input, team-rename-save,
    > team-member-row, team-member-owner-badge.
    _Task AC:_
    - No-team user sees the create form; creating refreshes into the populated card with them as owner
    - Owner sees an editable name + Save (disabled when empty); non-owner sees read-only name; members render with owner badge + joined date
  - :white_check_mark: **TASK-165** — Project-create UX: guide a teamless user to create/join a team  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/374)  
    _depends on: TASK-163_
    > When project creation returns needs_team (or on the dashboard when
    > the user has no team), surface guidance: 'Create a team in Settings to
    > start building, or join a teammate's via an invite link', linking to
    > /settings.
    _Task AC:_
    - A teamless user attempting to create a project sees the create-or-join-a-team guidance linking to /settings; no error toast/crash
  - :white_check_mark: **TASK-166** :checkered_flag: — e2e: no-team -> create team -> rename -> create a project; members list  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/374)  
    _depends on: TASK-162, TASK-163, TASK-164, TASK-165_
    > Playwright: fresh user signs in -> /settings Team section shows empty
    > state -> create team 'Acme' -> rename to 'Acme Labs' -> create a
    > project succeeds -> member list shows the user as owner.
    _Task AC:_
    - The full no-team->create->rename->project flow passes; pre-create a project is blocked with needs_team guidance
    - STORY-54 acceptance_criteria satisfied.

- **STORY-55** — Own and belong to multiple teams (each a pair)  [:white_check_mark: verified]
  > Evolve past STORY-54's one-team-per-user limit: a user may create and
  > own more than one team, and may also be a partner in teams owned by
  > others. /settings lists every team the user owns or belongs to, each
  > card clearly labelled with the team name and showing its members by
  > name (display name, falling back to email) with owner/partner badges
  > and joined dates. Per-team rename stays owner-gated. Each team is still
  > a pair (cap of 2) — joining/inviting is STORY-56; project-team
  > selection is STORY-57. Foundation for the rest of multi-team.
  **Acceptance criteria:**
  - A user already on a team can create another team and becomes its owner; the previous one-team-per-user 409 is gone — createTeam no longer refuses an existing member.
  - getTeamsForUser returns every team the user owns OR is a member of (not just one), each with its members [{userId, name, isOwner, joinedAt}]; the old single-team getTeamForUser callers are migrated.
  - /settings renders a list of team cards (newest first); each card shows the team name and, beneath it, that team's members by name (display name -> email fallback) with an owner badge, the partner if any, and joined dates.
  - A team's owner sees its name editable (rename persists + audit team.renamed, scoped to that team); a member sees that team's name read-only. Rename targets the correct team in the list.
  - A user in zero teams still sees the empty state inviting them to create one; the Create-team control stays available even once they have a team.
  **User flow:**
  1. User with one team opens /settings -> 'Create team' is still available -> creates a second -> both cards listed, user is owner of both
  2. Partner (member of someone else's team) opens /settings -> sees that team's card (name read-only, members by name) alongside any team they own
  3. Owner edits the name on one card -> only that team renames
  **Out of scope:**
  - Inviting / removing / leaving members (STORY-56) and project-team selection (STORY-57)
  - Editing your own display name / profile (a later story) — members render by display name, falling back to email
  - More than 2 members per team, roles beyond owner/partner, transferring ownership, deleting a team
  - :white_check_mark: **TASK-167** — lib: getTeamsForUser (plural) + drop the one-team-per-user 409  `high` `medium` _(apps/web, packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/385)
    > Replace getTeamForUser with getTeamsForUser(userId): all teams the
    > user owns or belongs to (distinct), each hydrated with members
    > [{userId, email, displayName, isOwner, joinedAt}] + the viewer's
    > isOwner. Remove the already_in_team guard from createTeam (a user may
    > own multiple teams; createTeam still validates the name and makes the
    > creator owner+member). Migrate single-team callers (settings card,
    > dashboard hasTeam) to the list. Keep a thin getTeamById for rename.
    _Task AC:_
    - createTeam succeeds for a user already on a team (no 409); the creator is owner+member of the new team
    - getTeamsForUser returns every owned and member team with members; an unrelated user's team is excluded
    - teams.integration tests updated; rename stays owner-gated per team
  - :white_check_mark: **TASK-168** — Settings: list all your teams, each with its members by name  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/385)  
    _depends on: TASK-167_
    > Replace the single TeamCard with a list rendered from
    > getTeamsForUser: one card per team (newest first), each showing the
    > team name (editable for the owner, read-only for a member) and its
    > member rows by name with owner/partner badge + joined date. Keep the
    > create-team form always available (empty state when zero teams).
    > Testids: team-card (per card), team-name, team-member-row,
    > team-member-owner-badge; rename targets the card's team id.
    _Task AC:_
    - A user with two teams sees two cards, each labelled with its name and its own members by name
    - Owner can rename a specific card (persists to that team only); a member's card name is read-only
    - Create-team form is available even when the user already has a team; zero teams shows the empty state
  - :white_check_mark: **TASK-169** :checkered_flag: — e2e: create a second team; each card lists its members by name  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/385)  
    _depends on: TASK-167, TASK-168_
    > Playwright: a user creates team A, then team B from /settings; both
    > cards appear, the user is owner of both, and each card shows its
    > member list by name. Rename team B and confirm team A is untouched.
    _Task AC:_
    - Two-team flow passes: create A -> create B -> both listed with members by name -> rename B leaves A unchanged
    - STORY-55 acceptance_criteria satisfied.

- **STORY-56** — Manage each pair — invite, remove, leave per team (cap of 2)  [:white_check_mark: verified]
  > Per-team membership management, owner-controlled, each team bounded to a
  > pair. On a team's card in /settings the owner mints an invite (only when
  > that team has <2 members) and can remove the partner; a member can leave
  > that team. Accepting an invite for a full team is refused. Settings is
  > the single invite surface — the workspace header Invite button is
  > removed. Remediation surface: the owner of an over-cap team (e.g.
  > graham's 3-member team in prod) reconciles it back to a pair here.
  **Acceptance criteria:**
  - Only a team's owner (teams.createdBy) can mint an invite for that team or remove its members; a non-owner has no invite/remove controls and those APIs 403 for them (per team).
  - The 'Invite partner' control shows on a team's card only when that team has <2 members; at 2 it's replaced by a 'team is full' note. Minting for a full team returns 409 team_full.
  - Accepting an invite when its team already has 2 members is refused with a clear 'this team is full' message on /invite/[code] and adds no membership; an existing member re-opening their link still no-ops.
  - The owner can remove the partner from a team (confirm -> membership deleted -> audit team.member_removed); the owner cannot remove themselves and cannot be removed. After removal the target loses access to that team's projects (bounced; POST /api/sessions -> 403).
  - A member can leave a team they don't own (confirm -> own membership deleted -> audit team.member_left -> that card disappears from their list); the owner cannot leave their own team (refused).
  - An over-cap team (>2 members) is reconciled to 2 by the owner removing members; the cap only blocks new joins, never existing ones.
  - Settings is the only invite surface — the workspace header Invite button is removed.
  **User flow:**
  1. Owner on a solo team's card -> 'Invite partner' -> link minted + Copy; shares it out-of-band
  2. Invitee opens /invite/[code] -> (team has room) joins as partner, lands in that team's project
  3. A third person opens an invite for a full team -> 'This team is full (a pair). Ask the owner to make room.'
  4. Owner -> per-partner 'Remove' on a card -> confirm -> that card's member list updates; removed user blocked on their next request
  5. Partner -> 'Leave team' on a card -> confirm -> that card leaves their list
  **Out of scope:**
  - Force-terminating a removed/left member's already-open live socket or preview (next-request enforcement only)
  - Transferring ownership, deleting a team, or the owner leaving
  - More than 2 members, roles beyond owner/partner
  - Email/notification on invite or removal
  - Project-team selection on create (STORY-57)
  - :white_check_mark: **TASK-170** — Cap enforcement on acceptInvite + 'team_full' result  `high` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/388)
    > In acceptInvite, before adding membership, count the invite's team's
    > members; if already 2 and the accepter isn't already a member, return
    > {status:'team_full'} (add nothing). Preserve the existing atomic
    > single-use claim + already-member no-op. /invite/[code] renders a
    > 'this team is full' message for team_full (extend the REASONS map).
    _Task AC:_
    - A 3rd distinct user accepting a valid invite for a 2-member team gets status team_full and no membership row is added
    - An existing member re-opening their link still returns ok (already a member); the single-use atomic claim is unchanged
    - /invite/[code] shows a clear team-full message (testid invite-error) for team_full
  - :white_check_mark: **TASK-171** — lib + API: removeMember (owner) + leaveTeam (non-owner) with audit  `high` `medium` _(apps/web, packages/db)_ · [PR](https://github.com/g-chappell/praxis/pull/388)
    > Add the audit_action enum values team.member_removed +
    > team.member_left (migration). removeMember(ownerId, teamId,
    > targetUserId): owner-gated (403), refuse removing the owner/self,
    > delete the team_membership, recordAudit('team.member_removed').
    > leaveTeam(userId, teamId): delete own non-owner membership,
    > recordAudit('team.member_left'); the owner leaving is refused (409).
    > Routes: DELETE /api/teams/:id/members/:userId, POST
    > /api/teams/:id/leave. Removal/leave is idempotent.
    _Task AC:_
    - Non-owner calling remove -> 403; owner removing the partner deletes the membership + writes team.member_removed
    - Owner attempting to remove self or to leave that team -> refused (4xx); non-owner leave deletes own membership + writes team.member_left
    - After removal the target's userOwnsProject for that team's project is false (POST /api/sessions -> 403)
  - :white_check_mark: **TASK-172** — lib + API: team-level invite mint (owner-only, cap-aware)  `high` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/388)
    > Add createTeamInvite(userId, teamId): owner-gated (403 non-owner),
    > refuse when that team already has 2 members (409 team_full), else
    > mint via the existing teamInvites path. Route POST
    > /api/teams/:id/invites returning {code,url,expiresAt}. Generalizes
    > the current createInvite(userId, projectId) to a teamId lookup with
    > no project.
    _Task AC:_
    - Non-owner mint -> 403; mint when that team is full -> 409 team_full
    - Owner mint for a team with <2 members -> returns a /invite/<code> url
  - :white_check_mark: **TASK-173** — Team card controls: per-team invite / remove / leave; drop workspace Invite button  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/388)  
    _depends on: TASK-171, TASK-172_
    > Extend each team card (STORY-55 list). Owner: 'Invite partner' (mint
    > + link + copy, shown only when that team has <2 members; a 'team is
    > full' note at 2) and a per-partner 'Remove' (confirm). Member: 'Leave
    > team' (confirm). Reuse the invite link/copy UI; confirm dialogs
    > mirror the archive/delete pattern; router.refresh on success; inline
    > errors. Remove the workspace header InviteButton
    > (components/workspace/invite-button.tsx usage). Testids:
    > team-invite-button, team-invite-link, team-invite-copy,
    > team-full-note, team-member-remove, team-leave-button.
    _Task AC:_
    - On a team they own, the owner sees Invite only when <2 members (else the full note) + a Remove per partner; a member sees Leave and no invite/remove controls
    - Removing or leaving refreshes the list to the new membership; the workspace header no longer renders an Invite button
  - :white_check_mark: **TASK-174** :checkered_flag: — e2e: invite -> accept -> cap blocks 3rd -> owner removes -> access revoked  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/388)  
    _depends on: TASK-170, TASK-171, TASK-172, TASK-173_
    > Two-user Playwright: owner mints from a team card, partner accepts +
    > sees that team's project; a 3rd user accepting is shown team-full;
    > owner removes the partner -> partner re-opening the project is bounced
    > (no access). Assert the workspace header has no Invite button.
    _Task AC:_
    - Full flow passes: invite->accept->3rd blocked (team_full)->owner removes->removed user loses project access
    - STORY-56 acceptance_criteria satisfied.

- **STORY-57** — Choose a team when creating a project  [:white_check_mark: verified]
  > With users in multiple teams, a new project must say which team it
  > belongs to. The New-project form gains a team selector (the user's owned
  > + member teams); POST /api/projects takes a validated teamId. The
  > dashboard lists projects across all the user's teams, each labelled with
  > its team name. A user in zero teams still gets the create-or-join
  > guidance (STORY-54).
  **Acceptance criteria:**
  - The New-project form shows a team selector listing every team the user owns or belongs to; the selection is required and defaults to the most-recent team.
  - POST /api/projects accepts a teamId and creates the project under it only if the user is a member of that team; a teamId the user doesn't belong to is refused (403), and a zero-team user still gets 409 needs_team.
  - The dashboard lists projects from all the user's teams (not just one), each row/card labelled with its team name.
  - A user in exactly one team sees that team preselected (no friction); the teamless guidance/link to /settings is unchanged.
  **User flow:**
  1. User in two teams clicks 'New project' -> picks Team B in the selector -> the project is created under Team B and appears labelled 'Team B' on the dashboard
  2. User in one team -> selector preselects it -> create works as before
  3. User in zero teams -> create-or-join-a-team guidance (unchanged)
  **Out of scope:**
  - An 'active team' global context / nav switcher (selection is per-create only)
  - Moving an existing project between teams; per-team dashboard filter tabs
  - Restricting create to owned teams (members of a team may also create in it)
  - :white_check_mark: **TASK-175** — lib + API: create project under a chosen team; list with team label  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/389)
    > POST /api/projects accepts { teamId } and creates under it only when
    > the user is a member (else 403); a missing teamId with exactly one
    > team defaults to it; zero teams still 409 needs_team. listUserProjects
    > returns each project's teamId + team name (join) for labelling.
    _Task AC:_
    - POST with a teamId the user belongs to creates under it; a teamId they don't belong to -> 403; zero teams -> 409 needs_team
    - listUserProjects includes each project's team name across all the user's teams
  - :white_check_mark: **TASK-176** — New-project form team selector + dashboard team labels  `high` `medium` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/389)  
    _depends on: TASK-175_
    > CreateProjectForm gains a team <select> populated from the user's
    > teams (preselect the most-recent; required). The dashboard passes the
    > teams + renders each project labelled with its team name. Testid:
    > create-project-team-select.
    _Task AC:_
    - The selector lists all the user's teams; a user in 2 teams can pick which one and the project lands under the chosen team
    - The dashboard shows each project's team name; a single-team user sees it preselected
  - :white_check_mark: **TASK-177** :checkered_flag: — e2e: pick a team on create; project shows under that team  `med` `small` _(apps/web)_ · [PR](https://github.com/g-chappell/praxis/pull/389)  
    _depends on: TASK-175, TASK-176_
    > Playwright: a user in two teams creates a project, selects Team B,
    > and the project appears on the dashboard labelled Team B.
    _Task AC:_
    - Two-team create flow passes: select Team B -> project created under B -> dashboard shows it labelled B
    - STORY-57 acceptance_criteria satisfied.

## EPIC-11 — Activity & event analytics

Capture a broad stream of user/platform events into the existing
project-scoped `events` table (generalized to user-level) and give admins
a view to browse and aggregate them. Privacy: log event metadata only,
never raw prompt text.

- **STORY-58** — Capture platform-wide user events
  > Today only admin/destructive actions are recorded (audit_log). Capture
  > a broad stream of user/platform events so activity is observable.
  **Acceptance criteria:**
  - events.project_id becomes nullable (migration) plus an index on (user_id, created_at); existing rows are unaffected.
  - recordEvent(userId, type, payload, projectId?) inserts one events row, is best-effort (swallows errors like recordAudit), and never stores raw prompt text.
  - Each wired action emits exactly one typed event: auth.signed_in/out, project.created/opened/archived/restored/duplicated/deleted, session.started/ended, prompt.submitted (metadata only: char/token count), team.member_joined/left, team.invite_minted.
  **Out of scope:**
  - The admin read view (separate story); retention/pruning of old events; raw prompt/response bodies; consent/opt-out UI.
  - :black_circle: **TASK-178** — db: events.project_id nullable + (user_id, created_at) index  `high` `small` _(packages/db)_
    > Migration relaxes events.project_id to nullable and adds
    > idx_events_user_time on (user_id, created_at). Idempotent; regen
    > drizzle codegen types.
    _Task AC:_
    - migration makes project_id nullable + adds idx_events_user_time
    - drizzle codegen types regenerate clean
  - :black_circle: **TASK-179** — recordEvent helper + event-type union  `high` `medium` _(apps/web, services/orchestrator)_
    > Add recordEvent(userId, type, payload, projectId?) that inserts one
    > events row best-effort (swallow + console.warn on error, like
    > recordAudit). Shared event-type union. The orchestrator already
    > writes events via usage.ts/chat-history.ts — reuse that path for
    > session/prompt events.
    _Task AC:_
    - recordEvent inserts a row with userId/type/payload/projectId?
    - a thrown DB error is swallowed, not propagated
  - :black_circle: **TASK-180** — Wire recordEvent into the action sites  `high` `medium` _(apps/web, services/orchestrator)_  
    _depends on: TASK-179_
    > Emit events at: auth sign-in/out (web), project
    > create/open/archive/restore/duplicate/delete (web), session
    > start/end + prompt.submitted (orchestrator; metadata only — char/token
    > count, not the text), team join/leave + invite mint (web).
    _Task AC:_
    - each listed action emits its event type exactly once
    - prompt.submitted payload has length/token metadata, not the prompt text
  - :black_circle: **TASK-181** :checkered_flag: — Tests: event capture  `med` `small` _(apps/web)_  
    _depends on: TASK-178, TASK-179, TASK-180_
    > Unit for recordEvent (best-effort) + integration that key sites write
    > the expected event rows.
    _Task AC:_
    - integration: creating a project writes a project.created event row
    - STORY-58 acceptance_criteria satisfied.

- **STORY-59** — Admin activity & analytics view
  > An admin screen to browse the captured event stream and see headline
  > activity aggregates.
  **Acceptance criteria:**
  - A new admin Activity surface (distinct from the audit-log viewer) lists events newest-first — time, user (name->email), type, project — filterable by user, event type, and time window (default 30 days).
  - Headline aggregate cards over the window: active users (distinct user_id), sessions started, total events, top event types.
  - Empty state when no matches; the list caps at a sane limit (e.g. 200) with the cap disclosed.
  **User flow:**
  1. Admin clicks 'Activity' in the admin sub-nav -> the activity view
  2. Sees aggregate cards + an events table for the last 30 days
  3. Filters by a user / event type / time window -> table + cards update
  **Out of scope:**
  - Charts beyond simple counts; CSV export; real-time streaming; per-event drill-down pages.
  - :black_circle: **TASK-182** — lib: list + aggregate event queries  `high` `medium` _(apps/web)_
    > listEvents(filter: {userId?, type?, since}, limit) newest-first
    > capped; aggregateEvents(window) -> {activeUsers, sessionsStarted,
    > total, byType[]}.
    _Task AC:_
    - listEvents filters by user/type/since and caps results
    - aggregates return distinct-user + by-type counts for a window
  - :black_circle: **TASK-183** — Admin Activity page + table + aggregate cards + filters  `high` `medium` _(apps/web)_  
    _depends on: TASK-182_
    > Admin page rendering the aggregate cards + a filterable events table
    > (user-by-name with email fallback). Filters: user, type, window
    > (default 30d). Empty + cap-disclosed states. Testids for table + filters.
    _Task AC:_
    - table renders user by name with email fallback
    - filters re-query and update table + cards
    - empty state shows when no matches
  - :black_circle: **TASK-184** :checkered_flag: — Tests: admin activity view  `med` `small` _(apps/web)_  
    _depends on: TASK-183_
    > Component test for filter/empty behavior + integration for the queries.
    _Task AC:_
    - filtering updates results
    - STORY-59 acceptance_criteria satisfied.

## EPIC-12 — Admin & UX polish

Small admin/UX fixes — in-admin navigation, a member-name display bug, and
cursor visibility on the parchment theme.

- **STORY-60** — Admin screen polish: back-nav + member names
  > Make every admin page navigable back to the admin home without the top
  > navbar, and fix blank member names on the admin project detail.
  **Acceptance criteria:**
  - Every /admin/* page renders a persistent admin sub-nav (in admin/layout.tsx) linking to all admin sections (Overview, Projects, Users, Activity, Usage, API keys, Connectors, Blocklist) with the current section marked active — returning to the admin home never requires the top navbar.
  - The admin project-detail member list shows each member's display name (trimmed) falling back to email when blank — no blank rows.
  **User flow:**
  1. Admin on any /admin/* page uses the sub-nav to navigate without the top navbar
  2. Admin opens a project detail -> each member row shows a name or email, never blank
  **Out of scope:**
  - Admin IA redesign; editing member display names (profile, future); advanced responsive sub-nav behavior.
  - :black_circle: **TASK-185** — Admin sub-nav in admin/layout.tsx  `high` `small` _(apps/web)_
    > Persistent sub-nav listing all admin sections with active-state
    > highlighting, rendered in the admin layout so it appears on every
    > /admin/* page.
    _Task AC:_
    - each admin section link renders + the active one is marked
    - navigating between sections doesn't need the top navbar
  - :black_circle: **TASK-186** — Fix admin project-detail member name fallback  `high` `small` _(apps/web)_
    > In apps/web/app/admin/projects/[id]/page.tsx change member display
    > from m.name ?? m.email to m.name?.trim() || m.email (the
    > displayName='' bug class).
    _Task AC:_
    - a member with empty/blank display name shows their email, not blank
  - :black_circle: **TASK-187** :checkered_flag: — Tests: sub-nav active + member fallback  `med` `small` _(apps/web)_  
    _depends on: TASK-185, TASK-186_
    > Component tests for the sub-nav active state and the member
    > name->email fallback.
    _Task AC:_
    - active section is marked
    - blank display name falls back to email
    - STORY-60 acceptance_criteria satisfied.

- **STORY-61** — Higher-contrast cursor on parchment
  > Improve mouse-cursor visibility against the beige/parchment background.
  **Acceptance criteria:**
  - On the beige/parchment surfaces (dashboard, settings, workspace, admin) the default cursor is higher-contrast (dark-outlined/scaled via CSS) without overriding semantic cursors (links/buttons keep pointer, inputs keep text).
  - Theme-aware: no visibility regression in dark mode.
  **User flow:**
  1. User moves the mouse across the beige dashboard/workspace -> the cursor is clearly visible against the background
  **Out of scope:**
  - Custom-drawn brand cursor asset; per-user cursor preference; changing the background color itself.
  - :black_circle: **TASK-188** — Cursor CSS treatment (scoped, theme-aware)  `high` `small` _(apps/web)_
    > Higher-contrast default cursor on the app's beige surfaces via CSS in
    > globals.css; scoped so interactive elements keep their semantic
    > cursors; theme-aware (no dark-mode regression).
    _Task AC:_
    - default cursor on beige surfaces is higher-contrast
    - links/buttons/inputs retain their semantic cursors
  - :black_circle: **TASK-189** :checkered_flag: — Verify cursor across surfaces + dark mode  `med` `small` _(apps/web)_  
    _depends on: TASK-188_
    > Verify cursor visibility on workspace, dashboard, settings, admin in
    > light mode and confirm no regression in dark mode.
    _Task AC:_
    - cursor visible on all main surfaces in light mode
    - no regression in dark mode
    - STORY-61 acceptance_criteria satisfied.

## EPIC-13 — Email + password authentication

Add real email+password signup/login alongside magic link (Better Auth
emailAndPassword) with required email verification. Non-breaking; magic
link stays; no user migration.

- **STORY-62** — Email + password signup & login (email verification required)
  > Add real email+password signup/login alongside magic link, with required
  > email verification on signup.
  **Acceptance criteria:**
  - Better Auth emailAndPassword is enabled with requireEmailVerification; signup with email+password creates an account and sends a verification email via the existing mailer; email+password login is blocked until verified.
  - Signup validates email format + password (min 8) and surfaces server errors (e.g. email already in use); success shows a 'check your email to verify' state.
  - Clicking the verification link marks the account verified and lands the user signed-in (or at /signin ready to log in).
  - /signin offers email+password login alongside the magic-link option; an unverified password account logging in is blocked with a clear 'verify your email' message + resend; magic link continues unchanged.
  **User flow:**
  1. New user -> /signup -> email+password -> submit -> 'check your email' state; verification email sent
  2. User clicks verify link -> account verified -> signed in / can log in
  3. Returning user -> /signin -> 'Password' option -> email+password -> /dashboard
  4. Unverified user tries password login -> blocked with 'verify your email' + Resend
  **Out of scope:**
  - OAuth/social login; MFA; password strength meter beyond min length; migrating existing magic-link users to passwords; account deletion.
  - :black_circle: **TASK-190** — Enable emailAndPassword + email verification in Better Auth  `high` `medium` _(apps/web, packages/db)_
    > Enable emailAndPassword with requireEmailVerification in lib/auth.ts;
    > wire sendVerificationEmail through the existing mailer interface;
    > confirm Better Auth account/verification tables exist (schema).
    _Task AC:_
    - emailAndPassword + requireEmailVerification enabled
    - sendVerificationEmail routes through the existing mailer
  - :black_circle: **TASK-191** — /signup page + route  `high` `medium` _(apps/web)_  
    _depends on: TASK-190_
    > Signup form (email + password), client validation (email format,
    > password min 8), calls authClient.signUp.email; on success shows a
    > 'check your email to verify' state; surfaces server errors (e.g.
    > email in use). Testids.
    _Task AC:_
    - empty/invalid email or <8-char password blocks submit
    - successful signup shows check-email state and does not log in until verified
  - :black_circle: **TASK-192** — Email-verification landing  `high` `medium` _(apps/web)_  
    _depends on: TASK-190_
    > Handle the Better Auth verification link: valid -> mark verified ->
    > signed-in/dashboard or /signin; invalid/expired -> clear error + resend.
    _Task AC:_
    - a valid verify link marks the account verified
    - an invalid/expired link shows a clear error + resend
  - :black_circle: **TASK-193** — /signin: email+password alongside magic link  `high` `medium` _(apps/web)_  
    _depends on: TASK-190_
    > Add email+password login to /signin alongside the magic-link option;
    > unverified account -> 'verify your email' + resend; magic link unchanged.
    _Task AC:_
    - email+password login succeeds for a verified account
    - unverified login blocked with verify message + resend; magic link still works
  - :black_circle: **TASK-194** :checkered_flag: — e2e: signup -> verify -> login  `med` `small` _(apps/web)_  
    _depends on: TASK-191, TASK-192, TASK-193_
    > Playwright: signup -> verify via DevMailer link -> password login ->
    > /dashboard.
    _Task AC:_
    - full signup->verify->password-login flow passes
    - STORY-62 acceptance_criteria satisfied.

- **STORY-63** — Password reset
  > Forgot-password -> email -> reset, via the existing mailer and Better Auth.
  **Acceptance criteria:**
  - A 'Forgot password?' entry from /signin lets a user request a reset; a reset email is sent via the mailer; the response is always neutral ('if an account exists, we sent a link') to avoid account enumeration.
  - The reset link opens a set-new-password page (min 8 + confirm); submitting updates the password and lets the user log in with it; the link is single-use + time-limited.
  **User flow:**
  1. User -> /signin -> 'Forgot password?' -> enters email -> 'if an account exists...' confirmation
  2. Opens reset email -> set-new-password page -> submits -> can log in with the new password
  **Out of scope:**
  - Reset via SMS/other channels; password history/reuse rules; forced reset on suspicious activity.
  - :black_circle: **TASK-195** — Forgot-password request page + route  `high` `medium` _(apps/web)_
    > Forgot-password page/route from /signin: enters email, calls
    > authClient.requestPasswordReset via the mailer; always returns the
    > neutral 'if an account exists' message (no enumeration).
    _Task AC:_
    - request always returns the neutral message (no enumeration)
    - a reset email is sent for an existing account
  - :black_circle: **TASK-196** — Reset-token page (set new password)  `high` `medium` _(apps/web)_  
    _depends on: TASK-195_
    > Set-new-password page from the reset link: new password + confirm
    > (min 8), calls authClient.resetPassword; single-use + time-limited token.
    _Task AC:_
    - <8-char or mismatched confirm blocks submit
    - valid token + new password updates it; invalid/expired token errors
  - :black_circle: **TASK-197** :checkered_flag: — e2e: request -> reset -> login  `med` `small` _(apps/web)_  
    _depends on: TASK-195, TASK-196_
    > Playwright: request reset -> open DevMailer reset link -> set new
    > password -> log in with it.
    _Task AC:_
    - request->reset->login-with-new-password flow passes
    - STORY-63 acceptance_criteria satisfied.
