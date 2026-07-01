# AGENTS.md — Praxis

> Cross-tool agent-context file. Read by Claude Code (via `CLAUDE.md` →
> `@AGENTS.md`), Codex, Cursor, Cline, Zed, Aider, and any other
> agentic-coding tool that follows the AGENTS.md convention.
>
> Three tiers of rules live here, clearly separated by HTML comment markers.
> `autonomous-review` only proposes additions to Tier 2 (project conventions)
> and Tier 3 (tech-coupled). Tier 1 (universal rules) is frozen — do not edit.

## Project overview

Praxis is a collaborative workspace where two non-technical or lightly-technical
people build, deploy, and learn together with AI coding agents. The platform
hosts Claude Code (and later Codex) in a managed multiplayer environment.
Pairs pick a template, prompt the agent, and end the session with a working
app at a live preview URL, a git history that shows how they built it, and
material added to each user's portfolio. The POC runs entirely on a single
VPS — Next.js frontend, Bun/Hono orchestrator, Docker-per-project sandboxes,
all behind Caddy. Engineering concentrates on two abstractions that must
survive the next 12 months: the ACP host layer (so any ACP-speaking agent
plugs in) and the Sandbox interface (so Docker can be swapped for E2B or
Firecracker without touching consumers).

See `ARCHITECTURE.md` for the high-level system shape and `docs/project_plan.md`
for the full POC scope.

## Tech stack

- **Language:** TypeScript (strict)
- **Framework:** Next.js 14 App Router (apps/web) + Hono on Bun (services/orchestrator)
- **Runtime:** Node 20 for tools and web; Bun 1 for the orchestrator
- **Database:** Postgres 16 (managed by drizzle-kit or kysely)
- **Test framework:** Vitest (unit + integration); Playwright (end-to-end)
- **Lint + format:** Prettier 3 + ESLint 9 (flat config). See ADR-0003.
- **CI:** GitHub Actions
- **Deploy:** Docker + Caddy on a single VPS (target: `praxis.local`); auto-deploy on merge to main

## Key commands

```bash
pnpm -r --parallel --if-present dev   # start all dev servers (web, orchestrator)
pnpm test                             # run all tests (root Vitest)
pnpm -r --if-present typecheck        # tsc --noEmit across workspaces
pnpm lint                             # prettier --check && eslint
pnpm format                           # prettier --write && eslint --fix
pnpm -r --if-present build            # production build for all workspaces
```

## Workspace structure

```
apps/web                       Next.js frontend (landing, dashboard, workspace UI)
services/orchestrator          Bun + Hono — WebSocket hub, ACP host driver, sandbox lifecycle
packages/db                    Postgres schema, migrations, codegened types
packages/sandbox               Sandbox interface + DockerSandbox implementation
packages/acp-host              ACP JSON-RPC host (spawn agent, stream events)
packages/crypto                libsodium-based encrypt/decrypt for OAuth tokens at rest
packages/shared                Types and constants shared across web + orchestrator
templates/react-threejs-scene  POC template — Vite + React + @react-three/fiber + drei
infrastructure/caddy           Caddyfile(s) (app, api, *.preview wildcards)
infrastructure/docker          Dockerfiles (sandbox base image, web image, etc.)
infrastructure/deploy          systemd units, docker-compose.dev.yml, deploy runbooks
infrastructure/mcp-servers     MCP servers (image-gen for POC)
```

## Code style summary

- TypeScript strict; named exports (no default exports unless a framework requires one).
- Prettier 3 (`.prettierrc.json`): single quotes, trailing commas, 100-column print width, semicolons. Run `pnpm format` before opening a PR.
- ESLint 9 flat config (`eslint.config.js`): `@eslint/js` recommended + `typescript-eslint` recommended.
- Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).

## Never do

- Modify OAuth token handling (`packages/crypto`, `oauth_tokens`, refresh flow) without review; or mishandle the **platform Anthropic API key** (ADR-0009) — it powers all inference, encrypted via `packages/crypto`, admin-managed (EPIC-05): never log/commit it or return it in plaintext, and pass it to the agent only as `ANTHROPIC_API_KEY` (never a per-user OAuth token).
- Commit secrets (`.env`, credentials, OAuth client secrets). The deny list in `.claude/settings.json` blocks `Read`/`Write`/`Edit` on `.env*` — don't try to work around it.
- Bypass the `Sandbox` interface (packages/sandbox) or the `AcpHost` (packages/acp-host) by importing Docker / Anthropic SDKs from consumer code. The abstractions exist so we can swap implementations.
- Relax sandbox idle shutdown (30 min default) or resource limits (1 CPU, 2 GB memory, 5 GB disk) without an ADR.
- Change anything ACP- or MCP-related without an ADR — they're load-bearing open standards (see `docs/project_plan.md` §4–5).

---

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 1 — UNIVERSAL RULES. Frozen. autonomous-review will never modify. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Universal rules

- **Implement to the Story, not the literal Task body.** Each task you pick is one slice of a Story. Read the Story's `acceptance_criteria`, `user_flow`, and `out_of_scope` from `roadmap/roadmap.yml` BEFORE writing any code. Your work must move the Story toward "all AC satisfied" — never produce stubs, placeholders, or mock data that would fail an AC if exercised end-to-end. Adding work strictly outside the Story's scope is still forbidden — refine via `/roadmap-add` first.
- **One Story → one PR, per-task commits.** A Story's tasks land on the same branch as separate commits; the terminal task's commit closes the Story. If a Story proves too large mid-flight, refine via `/roadmap-add` into smaller Stories rather than splitting the PR.
- **No stubs, no placeholders. Ever.** If during implementation you discover the current task can't be completed without producing a stub/placeholder, **do not ship the stub**. Two paths:
  1. Add follow-up tasks via `/roadmap-add` (or edit `roadmap.yml` directly) and continue the current task only if its own `task_acceptance` can be met WITHOUT the stub. The new follow-ups land in the same PR under the same Story.
  2. Mark the task `status: blocked` with a clear `blocked_reason` and stop if the gap is ambiguous (design decision needed) or the current task itself can't satisfy its `task_acceptance` without the stub.

  A "stub" is any of:
  - A function that returns a hardcoded placeholder string (`"Coming soon"`, `"TODO"`, `"lorem ipsum"`, `"TBD"`)
  - A UI element rendered with mock/fake data when the real source exists
  - A `TODO`/`FIXME`/`XXX` comment without a `(TASK-NNN)` reference to a roadmap task that resolves it
  - An exported symbol that throws `"not implemented"` or returns `null`/`undefined` while the caller's contract requires a value
  - A route, button, or menu item that renders nothing or no-ops on click

  Two layers catch stubs. The `stub-scan.mjs` PostToolUse hook fires on every Write/Edit (fail-fast at the keystroke). Before opening the PR that closes a Story, run `node scripts/story-acceptance-check.mjs <STORY-ID>` — it greps the full branch diff for stub patterns AND runs an LLM judgment against the Story's `acceptance_criteria`. Exit 0 = ship; exit 1 = fix and re-run.
- Edit one file at a time. Run typecheck + targeted tests after each edit before moving to the next.
- Read the full file/component before modifying it. Verify all sibling elements, handlers, and conditional branches survive the edit.
- Never skip tests after a change — even a "trivial" one. UI changes especially need explicit verification.
- **Verify externally after deploys and config changes.** CI green ≠ live serving. After a deploy or VPS config change (Caddy reload, env-file edit, sudoers, systemd unit, image push), probe the live URL / `docker ps` / log tail to confirm the change took effect. "Never skip tests" covers in-process testing; this is the deploy-layer analogue.
- If you notice unrelated brokenness, flag it; do not fix in the same PR.
- Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).
- Default to writing no comments. Only add when the **why** is non-obvious.
- Never introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10). Fix immediately if you notice.
- Do not take destructive git actions (force-push to main, hard-reset, amend published commits) without explicit user approval.
- Never commit secrets (.env, credentials). Warn if a user asks to. **If a secret has been seen by anyone other than the operator** (chat transcript, screenshot, shared terminal, paste service), **rotate it immediately** — assume compromise. Same rule, two cases: don't commit, and respond fast when it leaks. **Don't expose them in the first place:** when handling secret files (env-files, keys) for rotation or debugging, never print their *values* — `grep` names only, read values into shell variables via `$(…)`, emit status-only output (hashes, byte counts, HTTP codes). `cat`-ing a prod env-file into a transcript is itself an exposure (it forced a full secret rotation this session — procedure in `docs/conventions/deploy.md`).

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 2 — PROJECT CONVENTIONS. Edit freely. autonomous-review may append. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Project conventions

- **AGENTS.md is the primary cross-tool agent-context file.** `CLAUDE.md` is one line: `@AGENTS.md`. Per-workspace `AGENTS.md` files override at sub-folder scope; the sibling `CLAUDE.md` in each workspace is also a single `@AGENTS.md` import. Keep root AGENTS.md under 200 lines; push detail into `docs/conventions/` or `ARCHITECTURE.md`.
- **ADRs in `docs/decisions/`** for any decision that crosses component boundaries, introduces a new external dependency, or chooses between non-obvious alternatives. Half a page is enough. Sequential numbering, format: Context / Decision / Consequences / Alternatives.
- **Two open standards are load-bearing.** Anything ACP- or MCP-related changes only with an ADR and confirmation from both contributors. ACP transport + the billing model are settled in **ADR-0009**: Claude speaks ACP via the `@agentclientprotocol/claude-agent-acp` adapter (no native ACP mode), and inference runs on a **platform-owned API key**, not per-user subscription OAuth (hosted multiplayer can't use a personal subscription). `AcpHost` is the swap point for native-ACP agents (Codex) later.
- **Branch-as-payload.** Roadmap status changes travel through the PR, never committed directly to main. Branch naming: `auto/<TASK-ID>-<slug>` is the convention for every Story PR (the `auto/` prefix is historical — it does not imply autonomous run). Ad-hoc human PRs use `<initials>/<slug>`.
- **Two abstractions are sacred.** The `Sandbox` interface (packages/sandbox) and the `AcpHost` layer (packages/acp-host) exist so downstream choices stay reversible. Don't bypass them, don't leak Docker or Anthropic specifics into consumers, and require an ADR before changing their shape.
- **Secrets, OAuth tokens, and the platform API key** are encrypted at rest via `packages/crypto`. Never log raw tokens/keys. The master key (`PRAXIS_MASTER_KEY`) lives only in `.env` and the VPS systemd environment. The platform Anthropic API key is admin-managed (EPIC-05): pasted once, stored ciphertext-only, surfaced masked, rotatable; admin surfaces are role-gated server-side.
- **Idle shutdown is non-negotiable** for sandboxes (30 min default). Resource limits per project_plan.md §6 — don't relax without an ADR.

## Scaffolding hygiene

- **Gitignore new tooling artefacts in the same PR that introduces the tool.** Audit what the tool writes to disk on first use and add paths to `.gitignore` *before* opening the PR. For the Praxis stack: Next.js/Vite/Bun (`.next/`, `.vite/`, `.turbo/`, `dist/`, `build/`, `*.tsbuildinfo`); Drizzle/Kysely (`drizzle/.snapshot/`); Docker (`.docker-build/`); Playwright (`playwright-report/`, `test-results/`); Vitest (`coverage/`); editors (`.idea/`, `.vscode/`, `.DS_Store`).

## Shipping infrastructure work

- **Pre-merge local validation** for any PR touching `services/**`, `apps/**`, `packages/**`, `infrastructure/**`, or `.github/workflows/**`:
  ```bash
  pnpm lint && pnpm -r --if-present typecheck && pnpm test && pnpm -r --if-present build
  node scripts/deploy-readiness-check.mjs            # Dockerfile workspace-dep COPYs (+ LLM risk pass)
  caddy validate --config infrastructure/caddy/Caddyfile --adapter caddyfile
  systemd-analyze verify infrastructure/deploy/*.service
  ```
  CI runs line 1 + the deploy-readiness scripted layer; the Caddy + systemd checks are local-only and easy to forget. A bad unit file fails *after* the deploy-job restart on the VPS, not in CI.
- **A deployable that gains a `@praxis/*` workspace dep MUST update its Dockerfile in the same PR** — COPY the package's manifest into the deps layer *and* its source into the build layer. CI builds the full monorepo so a missing COPY passes there, but the image (selective COPY) crash-loops at runtime — STORY-07 hit this twice (`@praxis/crypto` in web, `@praxis/sandbox` in orchestrator). `deploy-readiness-check.mjs` catches it; see `docs/conventions/deploy.md`.
- **Verify infra stories at the deploy layer, for real.** No-build services (Bun runs TS natively) only fail at *runtime* — boot the image with prod-like env and watch the logs. Host-resource changes (Docker socket, ports, volumes, container-user group perms) and timer-driven behaviour (e.g. the 60s idle sweep) need a *real cycle* observed, not a few-second smoke test — that's a false positive. A `.service` change also needs a manual VPS re-apply (`cp → daemon-reload → restart`); the deploy restarts but does not copy the unit file.
- **"Operator follow-ups" section in every infrastructure PR.** Bullet-point what the human has to do on the VPS / DNS provider / package registry that the workflow can't (DNS records, GHCR visibility flip, env-file additions, sudoers extensions, unit re-apply). The runbook records these once they're done.
- **DB migrations are a manual operator follow-up — apply them by hand, right after merge.** Prod has no Drizzle journal, so never `db:migrate` against it; apply the new migration's SQL via `docker exec -i praxis-db psql` (procedure + applied-ledger in `docs/conventions/database.md`). Deploys don't apply migrations and a missing column fails *silently* until first exercised, so *flagging isn't enough — execute it before moving on.*
- **One runbook per deployable** at `docs/runbooks/deploy-<service>.md`. Topology, daily ops (status/logs/restart/rollback), and a "Setup history" section that captures the one-time bootstrap so a future VPS rebuild is reproducible. See `docs/runbooks/deploy-{web,postgres,orchestrator}.md` for the shape.

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- Tier 3 — TECH-COUPLED RULES. Evolves with the stack. -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

## Cross-cutting conventions

Topic cookbooks. Read the relevant file before touching that layer:

- **`docs/conventions/deploy.md`** — VPS shape, `praxis-net` Docker bridge, port allocation, Caddy composite at `/etc/caddy/Caddyfile`, env-file format quirks (ASCII-only, no inline comments), systemd unit skeleton, GHCR image policy (tags, build context, first-push 403, `GIT_SHA` arg), CI deploy workflow shape, sudoers fragment, operator follow-ups, and **disk hygiene** (deploys pile up images → `/` fills → recover/auto-prune via `praxis-hygiene.timer`). When a deploy lands green but `/health` keeps serving the old `gitSha`, the self-hosted runner may be wedged after a prior failure — restart `actions.runner.…praxis-vps.service` (see `docs/runbooks/deploy-orchestrator.md` → Troubleshooting).
- **`docs/conventions/database.md`** — Drizzle as source of truth, two import surfaces (`@praxis/db` schema-only vs `@praxis/db/client` lazy proxy), lazy initialization pattern for env-dependent modules (also applies to auth and mail), codegen drift check, no-mocking-the-DB rule, and **manual prod migrations** (no journal — apply each migration's SQL by hand right after merge; never `db:migrate` against prod).
- **`docs/conventions/auth-and-mail.md`** — Better Auth schema hybrid (ADR-0005), `pnpm.overrides` for kysely on Node 20, lazy auth singleton, middleware matcher precision, Playwright cold-compile pre-warm, mailer interface (Dev / Resend / loud-fail in prod), Resend domain verification two-step, API key rotation procedure.
- **`docs/conventions/orchestrator-runtime.md`** — the Bun↔dockerode rule (streaming ops 501 under Bun → use the docker CLI; reserve dockerode for unary lifecycle calls — ADR-0010/0014), docker-socket gid, sandbox `praxis-net` requirement, preview routing + the Vite HMR WebSocket tunnel (ADR-0015/STORY-30), **MCP servers in the sandbox** (Path A: project `.mcp.json` + `enableAllProjectMcpServers`, no acp-host change — ADR-0018), and **sandbox secret-handling** (no platform creds in `/workspace`/MinIO or sandbox env; per-session secrets via an ephemeral file outside `/workspace`; sandbox→platform ops via a token-gated orchestrator endpoint). Read before touching orchestrator/sandbox container I/O, MCP, or secret delivery.
- **`ARCHITECTURE.md`** — system shape, post-EPIC-01. Link to it; don't duplicate the diagram here.

## Testing patterns

- **Unit tests** with Vitest, colocated as `*.test.ts` next to the code they cover.
- **Integration tests** for `packages/sandbox` and `packages/acp-host` run against a real Docker daemon (gated by `RUN_DOCKER_TESTS=1` so CI without Docker still passes). The orchestrator-level integration tests run inside the CI job that has Docker available.
- **End-to-end tests** with Playwright in `apps/web/e2e/`. Smoke-level: sign in, create project, prompt and see a response.
- **No mocks of the database in tests that touch persistence.** Use an ephemeral Postgres via `docker-compose.dev.yml` or testcontainers.
- **No mocks of ACP.** The OSS ACP host fixture runs a real Claude Code subprocess with a recorded transcript for deterministic tests; full-stack tests use the real CLI.

<!--
When tier-2 or tier-3 grows past ~10 multi-paragraph bullets, split
subsystem-specific rules into a nested AGENTS.md under that subsystem
(e.g. `services/orchestrator/AGENTS.md`) with a sibling one-line
`CLAUDE.md: @AGENTS.md`. Do NOT use `.claude/rules/` or `docs/notes/`
with @-imports: @-imports inside `.claude/rules/*.md` are delivered
as literal text (never resolved), and `.claude/` paths are rejected
by Claude Code's Edit tool under --dangerously-skip-permissions.
-->

---

## Praxis workflow

Human-driven, Story-at-a-time. The deterministic helpers named below replace agent guesswork at each step:

1. **Claim a Story.** Load `acceptance_criteria`, `user_flow`, `out_of_scope` from `roadmap/roadmap.yml`. `node scripts/select-task.mjs --print-story <TASK-ID>` resolves task → Story.
2. **Plan.** Agent presents `/plan`; operator approves PR shape + architectural calls. Cut branch `auto/<TASK-ID>-<slug>`.
3. **Per task: implement → commit → mark done** via `node scripts/roadmap-update-task.mjs <TASK-ID> --status done --pr <URL> --completed-now` (surgical YAML mutation; the `posttool-roadmap-render.mjs` hook re-renders `ROADMAP.md`).
4. **Terminal task — gate the Story before its commit:**
   ```bash
   node scripts/story-remaining.mjs <STORY-ID> <TASK-ID>          # → 0 = terminal
   node scripts/story-acceptance-check.mjs <STORY-ID>             # exit 0 = ship
   node scripts/update-story-feature-complete.mjs <TASK-ID> verified
   ```
   Acceptance check is two layers (scripted stub-grep + LLM verdict vs AC). The `stub-scan.mjs` PostToolUse hook is the fail-fast layer; this script is the review gate. Exit 1 = fix and re-run. **Exit 2 = `unverifiable` is expected when a Story's ACs are live-only** (preview/DNS/sandbox/real-key/e2e behaviour the diff can't prove) — that's not a failure: ship the PR, then verify on the VPS post-deploy and only then run `update-story-feature-complete … verified`. Never mark `feature_complete: verified` from CI green for a live-only AC.
5. **Open the PR** (one per Story). CI required: `ci` (typecheck + lint + test + build); `e2e` runs alongside. Auto-merge on `main`; branch protection requires `ci`.
6. **GitHub Issues mirror Stories + Tasks** via `scripts/sync-issues.mjs`. On merge to `main`, the `sync-issues` workflow re-runs it and **closes any issue whose roadmap item is complete** (TASK `done`, STORY `feature_complete: verified`, EPIC all-stories-complete). Closure is driven by roadmap status, NOT by a PR's `Closes #N` — so just mark the roadmap done (steps 3–4) and the merge handles the issues. (The project-board **Status** step needs a PAT, so it's **local-only** — CI runs `--no-project`.) Consequence: after a roadmap merge, new issues land on board #3 as **"No Status"** (the auto-add workflow sets none) until you run `node scripts/sync-issues.mjs` locally — that seeds Backlog, promotes completed items Backlog→Done, and re-parents sub-issues whose task moved between stories. The durable fix is a Projects UI workflow ("Item added → Status: Backlog"); Projects v2 workflows can't be configured via the API (only deleted), so this is a one-time manual UI toggle.
7. **Operator merges.** Deploy workflows at `.github/workflows/deploy-<service>.yml` auto-fire on `main` pushes touching the service's paths.
8. **Externally verify** the live URL / `docker ps` / log tail before declaring done (see tier-1 "Verify externally after deploys").

The rest of `scripts/` and `.claude/skills/autonomous-*` are inherited from the project's initial scaffolding and are not used in the current flow; left in tree pending a future prune.

See `ARCHITECTURE.md` for system shape, `docs/project_plan.md` for full POC scope, and `docs/runbooks/deploy-*.md` for per-service ops.
