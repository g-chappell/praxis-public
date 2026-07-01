# AGENTS.md — services/orchestrator

Scoped guidance for the orchestrator. Inherits the root `AGENTS.md`.
This file documents conventions specific to this workspace.

## Runtime

- **Bun 1.1.** Production runs `oven/bun:1.1-alpine` via Docker.
- **No build step.** Bun runs TypeScript natively. `pnpm -r build`
  emits a noop for this workspace.
- **`tsc --noEmit`** is the typecheck command (matches the rest of the
  monorepo; CI does not install Bun).

## Routes

- One file per route group under `src/routes/` (e.g. `health.ts`,
  `ws.ts`). Each file exports a Hono sub-app; `src/index.ts` mounts
  them.
- Keep route handlers thin. Business logic that exceeds ~30 lines
  belongs in `src/lib/` or `src/services/`.

## WebSocket message contract

- All messages are JSON with a discriminator `type` field.
- Reserved types (STORY-05): `ping`, `pong`, `error`.
- Future stories add `prompt`, `agent_event`, `presence`, `file_lock`,
  etc. Each addition is its own ADR if it touches the wire format.
- Server replies use `ts: <epoch ms>` for any "what time is it"
  signal.

## Logging

- **pino** for structured logs. JSON in production, pino-pretty in
  development.
- One log line per HTTP request via the `httpLogger` middleware
  (method, path, status, duration_ms, request_id).
- WebSocket: log on open/close/error and on the first message of each
  connection. **Do not log every ping** — that's heartbeat-scale
  noise.

## Database

- Imports come from `@praxis/db/client` (the lazy `db` proxy) and
  `@praxis/db` (schema + types).
- `DATABASE_URL` is read at first DB access (lazy proxy). Module-load
  time does not require it.

## Agent credentials (ADR-0009)

When this service gains agent-spawn logic (STORY-09), it drives the agent
through `@praxis/acp-host` (`AcpHost`) and authenticates it with the
**platform Anthropic API key** — fetched server-side via the EPIC-05 accessor
(`getActivePlatformKey`, STORY-21) and passed to the sandbox **only** as
`ANTHROPIC_API_KEY`. Never forward a per-user subscription OAuth token to the
agent; never log the key. Record per-turn usage from `turn-complete` events
for metering (STORY-22).

## /health response shape

Locked in TASK-016. Do not break the shape without an ADR — uptime
monitors and the deploy workflow's smoke test both parse it:

```json
{
  "ok": true,
  "version": "0.0.0",
  "gitSha": "abc1234",
  "uptimeSec": 12345
}
```

`ok: true` is the canonical "alive" signal. Add fields freely; do not
remove or rename without an ADR.

## Tests

- **Vitest at the root**, in-process via `app.fetch`. Tests must run
  under Node + Vitest so the existing CI doesn't need Bun.
- Bun-specific tests (real `Bun.serve`) gate on
  `if (typeof Bun === 'undefined') { test.skip() }` so CI passes.

## See also

- Root `AGENTS.md` — universal rules + project-wide conventions
- `ARCHITECTURE.md` — orchestrator's place in the system shape
- `docs/runbooks/deploy-orchestrator.md` — ops procedures
