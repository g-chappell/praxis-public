# ADR-0012: Monaco editor (self-hosted) and the workspace file WS protocol

## Status

Accepted (2026-06-03)

## Context

STORY-10's workspace shell (TASK-030) left the file tree and editor panes empty.
TASK-031 makes them real: the user browses the sandbox's files, opens one in a
code editor, edits, and saves — and the edit must survive a refresh. Two
decisions cross component boundaries and warrant a record.

**1. Code editor.** We need an in-browser editor with syntax highlighting for the
template's TS/JS/GLSL/JSON files. Monaco (the VS Code editor core) is the roadmap
choice (TASK-031) and the de-facto standard. It is a **new external dependency**
in `apps/web` (`monaco-editor` + `@monaco-editor/react`).

Monaco's assets (the ~16 MB `vs/` AMD bundle) load at runtime via a loader.
`@monaco-editor/react` defaults to fetching them from the jsdelivr **CDN** — an
external runtime dependency: the editor breaks if the CDN is unreachable from the
user's browser, which sits awkwardly with the self-hosted, single-VPS ethos
(ADR-0011 deliberately removed external hops from the deploy path).

**2. File transport.** The browser has no direct sandbox access; everything goes
through the existing session WebSocket (STORY-09) and the orchestrator, which
owns the `Sandbox` handle. We need to move file listings, contents, and edits
over that socket. This is **not** an ACP/MCP concern (those are load-bearing
standards gated by ADR + both contributors) — it's an internal app protocol.

## Decision

**Self-host Monaco.** Add `monaco-editor` + `@monaco-editor/react`. Copy
`monaco-editor/min/vs` into `apps/web/public/monaco-vs` via
`apps/web/scripts/sync-monaco.mjs`, wired as `prebuild` + `predev` (and into the
Playwright `webServer` command), and point the loader at it:
`loader.config({ paths: { vs: '/monaco-vs' } })`. No CDN at runtime. The copied
dir is gitignored (generated, not source); the web Dockerfile already ships
`public/`, so the assets land in the image.

**Workspace file protocol** over the session socket (types defined inline — the
repo has no shared types package; this matches the existing `prompt`/`agent_event`
convention):

| direction | message |
| --- | --- |
| client → orch | `{ type: 'file_list' }` |
| client → orch | `{ type: 'file_read', path }` |
| client → orch | `{ type: 'file_save', path, content }` |
| orch → client | `{ type: 'file_tree', paths[] }` |
| orch → client | `{ type: 'file_contents', path, content }` |
| orch → client | `{ type: 'file_saved', path }` |
| orch → client (broadcast) | `{ type: 'file_changed', change, path }` |
| orch → client | `{ type: 'error', reason, path? }` |

The orchestrator seeds the tree with `git ls-files --cached --others
--exclude-standard` (bounded; excludes `.git/` and gitignored `node_modules`),
serves reads/writes through `Sandbox.readFile`/`writeFile`, and forwards
`Sandbox.watchFiles` events to the room as `file_changed`. Client paths are
validated project-relative (no absolute, no `..`).

## Consequences

- Editor works with no external runtime dependency; offline/CDN-blocked browsers
  are fine. Cost: a 16 MB asset copy step (cached/skipped when present) and ~16 MB
  added to the web image.
- File ops reuse the one session socket — no new endpoint, no new auth surface.
- `watchFiles` keeps every client's tree live and is the seam for multi-user
  presence later (STORY-11).
- The protocol stays swap-safe: it depends only on the `Sandbox` interface, so
  E2B/Firecracker backends need no client change.
- A monaco version bump requires deleting `public/monaco-vs` to re-copy (the sync
  skips when present); noted in the script.

## Alternatives

- **CDN loader (default).** Simplest, zero asset step, but an external runtime
  dependency that contradicts the self-hosted posture. Rejected.
- **Bundle Monaco via `monaco-editor-webpack-plugin`.** Tighter integration but
  notoriously fragile with the Next.js App Router; the loader+public approach is
  simpler and equally CDN-free.
- **CodeMirror.** Lighter, but Monaco was the roadmap choice and gives a
  VS-Code-grade experience the product wants.
- **REST endpoints for files.** A second auth surface + ticket flow; the socket
  already exists and gives us live `file_changed` for free.
