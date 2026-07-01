# ADR-0013: Add `Sandbox.destroy` for project deletion

## Status

Accepted (2026-06-03)

## Context

STORY-28 lets a user delete a project from the dashboard. The operator was
explicit: deletion must leave **no stale artifacts** — but a project's runtime
state lives in Docker (a `praxis-sandbox-<id>` container, a `praxis-project-<id>`
named volume, and optionally an object-store snapshot), which the web app must
not touch directly. The web app crosses the `Sandbox` boundary (ADR-0007) only
through the orchestrator; nothing outside `DockerSandbox` imports dockerode.

The existing `stop(handle)` stops + removes the *container* but deliberately
keeps the volume (that's how a session resumes). Deletion needs the opposite:
remove everything, for a project that may not be currently running (so it can't
be addressed by a live `SandboxHandle`).

Changing the `Sandbox` interface shape requires an ADR (ADR-0007).

## Decision

Add one method to the `Sandbox` interface:

```ts
destroy(projectId: string): Promise<void>;
```

- Takes a **projectId**, not a handle — the project is typically stopped when
  deleted, and the container/volume names are derived from the projectId.
- Removes the container (`force`), the named volume (`force`), and the
  object-store snapshot (when a store is configured). **Idempotent**: each
  artifact's "already gone" (404/409) is tolerated, so a double-delete is a no-op.
- `ObjectStore` gains a matching `deleteSnapshot(projectId)` (no-op when absent).

The orchestrator exposes `DELETE /projects/:projectId` (internal-secret-gated,
like `/sessions`): it tears down any in-memory room for the project
(`purgeProjectRooms`, stopping the file watcher) and calls `getSandbox().destroy`.
The web `DELETE /api/projects/[id]` (auth + ownership) calls it, then deletes the
DB rows, and logs the deletion for traceability.

## Consequences

- Project deletion leaves no Docker artifacts (verified by a Docker-gated test:
  container + volume gone, second destroy a no-op).
- The `Sandbox` interface stays the swap point: an E2B/Firecracker backend
  implements `destroy` in its own terms; consumers are unchanged.
- `destroy` is destructive and unauthenticated at the Sandbox layer by design —
  authorization (ownership) is enforced upstream in the web app, and the
  orchestrator endpoint is internal-secret-gated.

## Alternatives

- **`destroy(handle)`** — rejected: a deleted project usually has no running
  container/handle; deriving names from the projectId is what deletion needs.
- **Web app removes Docker artifacts directly** — violates the Sandbox boundary
  (ADR-0007) and would couple the web image to dockerode + the Docker socket.
- **Leave the volume (DB-only delete)** — rejected by the operator ("no stale
  artifacts"); orphaned volumes accumulate disk on the single VPS.
