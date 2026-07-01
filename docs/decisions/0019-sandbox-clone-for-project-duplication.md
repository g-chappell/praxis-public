# ADR-0019: Add `Sandbox.clone` for project duplication

## Status

Accepted (2026-06-06)

## Context

STORY-42 (EPIC-07 — Project lifecycle v2) lets a user duplicate a project from
the dashboard: "build on what worked." The duplicate must be an independent
project whose `/workspace` carries the **same files and full git history** as
the source at duplication time, opening to that state — and editing one must not
affect the other.

A project's workspace lives in a Docker named volume (`praxis-project-<id>`),
which the web app must not touch directly: it crosses the `Sandbox` boundary
(ADR-0007) only via the orchestrator, and nothing outside `DockerSandbox`
imports dockerode. The existing methods don't cover this: `start` seeds a fresh
workspace from a template, `destroy` removes everything, `stop` keeps the volume
for resume — none copy one project's volume into another's.

Changing the `Sandbox` interface shape requires an ADR (ADR-0007) and
confirmation from both contributors.

## Decision

Add one method to the `Sandbox` interface:

```ts
clone(sourceProjectId: string, newProjectId: string): Promise<boolean>;
```

- Takes **projectIds**, not handles — the source may be stopped, and the
  container/volume names are derived from the projectId (like `destroy`).
- Copies the source volume's contents (including `.git`) into the new project's
  volume (`praxis-project-<newId>`), preserving full git history. The
  implementation uses a short-lived helper container that mounts both volumes
  and runs `cp -a /src/. /dst/` — a volume-to-volume copy that needs no running
  source container. This stays Bun-safe (no streamed dockerode putArchive, which
  501s under Bun — see ADR-0010/0014); the helper's lifecycle (create / start /
  wait / remove) is unary dockerode, like `destroy`.
- **Returns `false` when the source has no volume** (its sandbox never started),
  so the caller seeds the template instead of producing an empty project;
  `true` when a volume was copied. The source volume is mounted read-only — the
  original is never mutated.

The orchestrator exposes `POST /projects/:projectId/duplicate` (internal-secret-
gated, like `/projects/:id` destroy): it calls `getSandbox().clone(source, new)`;
on `false` it falls back to `start(new, templateId)` to seed the template. The
web `POST /api/projects/[id]/duplicate` (auth + ownership) creates the new
project row (`Copy of <name>`, same team + template), calls the orchestrator,
and logs `project.duplicated`.

## Consequences

- Duplicating a populated project yields an independent project with the same
  files + git history, in its own volume (verified by a Docker-gated test:
  files + `.git` present in the new volume; source untouched).
- The `Sandbox` interface stays the swap point: an E2B/Firecracker backend
  implements `clone` in its own terms (volume snapshot/copy); consumers unchanged.
- `clone` is destructive toward the destination volume (overwrites its contents)
  and unauthenticated at the Sandbox layer by design — ownership is enforced in
  the web app and the orchestrator endpoint is internal-secret-gated.
- A duplicate gets a **fresh** sandbox + agent session: the live preview, running
  agent conversation, and chat history are not carried over (out of scope).

## Alternatives

- **`clone(handle)`** — rejected: the source is often stopped at duplication
  time; deriving names from the projectId is what duplication needs (mirrors
  `destroy`, ADR-0013).
- **Snapshot → restore via the object store** — copy by `putSnapshot(source)` then
  `getSnapshot` into the new volume. Rejected for the POC: the snapshot path is
  MinIO-gated and its restore leg still has the Bun putArchive issue (ADR-0010);
  a direct volume-to-volume `cp` is simpler and backend-honest.
- **Web app copies the volume directly** — violates the Sandbox boundary
  (ADR-0007) and couples the web image to dockerode + the Docker socket.
- **`git clone` source→dest over the network** — rejected: loses uncommitted
  working-tree state and needs a reachable git endpoint per sandbox; `cp -a`
  copies the whole workspace verbatim.
