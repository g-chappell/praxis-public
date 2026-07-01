# 0007 — Sandbox interface abstracts the execution backend

**Date:** 2026-06-01
**Status:** Accepted

## Context

Praxis runs each project's code (and the agent) inside an isolated sandbox.
The POC uses Docker containers on a single VPS, but the 12-month bet
(`AGENTS.md`, "Two abstractions are sacred") is that the execution backend
must stay swappable — E2B, Firecracker, or Daytona may replace Docker without
rewriting the orchestrator, ACP host, or workspace UI that drive sandboxes.
`docs/project_plan.md` §6 specifies the consumer-facing interface; this ADR
records it as a load-bearing boundary.

## Decision

`packages/sandbox` exports a single `Sandbox` interface — `start`, `exec`,
`spawn`, `writeFile`, `readFile`, `watchFiles`, `exposePort`, `stop` — verbatim
from §6, plus the supporting types (`SandboxHandle`, `ExecOptions`,
`ExecResult`, `SpawnOptions`, `ProcessHandle`, `FileEvent`, `Unsubscribe`).

- **Consumers depend only on the interface.** They never import `dockerode`,
  the Docker SDK, or any backend specific type. `SandboxHandle` is opaque —
  its `containerId` is implementation detail, not a contract.
- **`DockerSandbox` is the POC implementation** (TASK-022), behind the
  interface. `E2BSandbox` / `FirecrackerSandbox` can be added later as new
  implementations with zero consumer changes.
- **The interface shape is frozen behind this ADR.** Adding/changing a method
  or type requires a follow-up ADR — the same bar as the ACP host.
- `ProcessHandle` models long-running processes (dev server, agent) as
  streaming `AsyncIterable` stdout/stderr with `write`/`kill`/`wait`, so the
  orchestrator can drive interactive processes without backend specifics.

## Consequences

- Swapping backends is an implementation + an ADR, not a refactor of every
  consumer — the reversibility the roadmap is paying for.
- Every backend must satisfy all eight methods, including the harder ones
  (`watchFiles`, `exposePort`). A backend that can't (e.g. no file-watch) needs
  an explicit adapter, surfaced at integration-test time.
- Backend-specific knobs (Docker resource limits, network policy) live *inside*
  the implementation and its config, not on the interface — so they can't leak
  to consumers, but cross-backend features must be designed into the interface
  deliberately (via ADR) rather than bolted onto one backend.

## Alternatives considered

- **Consume `dockerode` directly in the orchestrator.** Fastest to build, but
  welds the whole stack to Docker — exactly the lock-in the project forbids.
- **A thinner interface (just `exec`/`stop`).** Insufficient: the workspace UI
  needs `watchFiles` and `exposePort`, and the agent needs streaming `spawn`;
  leaving them out would force consumers back to backend specifics.
- **A fatter interface mirroring Docker's API.** Leaks backend semantics and
  makes non-Docker backends hard to satisfy. Rejected for the minimal §6 set.
