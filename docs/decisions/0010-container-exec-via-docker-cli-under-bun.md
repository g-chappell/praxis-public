# 0010 — DockerSandbox exec/spawn via the docker CLI (Bun compatibility)

**Date:** 2026-06-02
**Status:** Accepted

## Context

The orchestrator runs on **Bun** (ADR/tech-stack choice; Bun + Hono is the
greenfield default and we're keeping it). It drives `DockerSandbox`
(`packages/sandbox`) via `dockerode`. STORY-09's first live run surfaced two
hard Bun↔Node-ecosystem incompatibilities:

1. **dockerode streaming exec fails under Bun.** `container.exec().start({hijack})`
   uses an HTTP 101 "Switching Protocols" upgrade (hijacked connection) that
   docker-modem's transport mishandles under Bun — it throws
   `(HTTP code 101) unexpected` asynchronously, so `spawn`/`exec`/`watchFiles`
   produce no output (the agent turn silently hangs). Confirmed by running the
   same dockerode streaming exec under Node (works) vs Bun (aborts). The
   non-streaming Docker API calls (create/start/stop, get/putArchive) work fine
   under Bun.
2. **libsodium's wasm doesn't load under Bun** (handled separately — the web app
   decrypts the platform key and hands it to the orchestrator; ADR-0009).

The sandbox tests never caught (1) because they run under Node (Vitest), where
dockerode is fine.

## Decision

**Keep dockerode for the container/volume/archive lifecycle; run all container
`exec` through the `docker` CLI via `node:child_process`.**

- `DockerSandbox.exec`/`spawn`/`watchFiles` (and the internal `execSimple` /
  `readPid` / `isWorkspaceEmpty`) now spawn `docker exec [-i] -w <cwd> [-e …]
  <containerId> …`. The CLI demultiplexes stdout/stderr and attaches stdio
  natively, and `child_process` runs **identically under Bun (prod) and Node
  (tests)** — one code path, no runtime branching, no reimplementation of
  Docker's stream-multiplex/upgrade protocol.
- dockerode still handles `createContainer`/`start`/`stop`, `getArchive`/
  `putArchive` (snapshots), `inspect`, and volumes — plain HTTP, Bun-safe.
- The orchestrator image installs `docker-cli` (it already mounts
  `/var/run/docker.sock` with the right group). The CLI uses the default
  `DOCKER_HOST`.
- The `Sandbox` interface shape is unchanged (ADR-0007 still holds) — this is an
  implementation detail of `DockerSandbox`.

## Consequences

- The Bun orchestrator can drive container exec reliably; the STORY-09 agent
  round-trip works (verified: real sandbox + real agent + real platform key
  streams a response). The intermittent `POST /sessions` 500s (same 101 cause)
  also resolve.
- Reliability over purity: we depend on the official `docker` CLI rather than a
  bespoke Bun-native Docker exec client — battle-tested, and one less wire
  protocol to maintain. Cost: the CLI binary in the orchestrator image (~tens of
  MB) and a subprocess per exec (negligible vs agent runtime).
- `kill()` still targets the in-container PID (pidFile + `kill`), since killing
  the local `docker exec` wouldn't stop the in-container process.
- If a Bun-native dockerode (or a Bun fix for HTTP-101 hijack) lands later,
  reverting to in-process exec is a localized `DockerSandbox` change.

## Alternatives considered

- **Move the orchestrator to Node.** Would fix the whole class (dockerode +
  libsodium) but abandons the deliberate Bun + Hono choice; rejected — the
  incompatibilities are addressable without re-platforming.
- **Bun-native Docker exec over a raw unix socket.** Most "pure" (no CLI binary),
  but reimplements Docker's attach/upgrade + stdout/stderr framing, and
  `Bun.connect` is Bun-only (the Node test path would need a second
  implementation). More surface, more risk, for no functional gain.
- **Patch/monkey-patch docker-modem's upgrade handling.** Fragile, ties us to
  docker-modem internals.

## Update (2026-06-03, STORY-26 / TASK-070)

The claim above that "get/putArchive work fine under Bun" was **only half right**.
Operator review found saving an edited file failed in prod (chat showed a session
error). Reproduced against the prod image under Bun: `readFile` (`getArchive`, a
download) works, but `writeFile`'s **`putArchive`** fails with `(HTTP code 501)
unexpected - Unsupported transfer encoding` — Bun's HTTP-over-unix-socket layer
rejects the chunked request body docker-modem streams for an unknown-length
upload. Node was unaffected, so the Node/Vitest sandbox tests never caught it
(same blind spot as the original exec bug).

Per this ADR's own decision, `writeFile` now streams content through the **docker
CLI** (`docker exec -i … tee <path>`, content on stdin) instead of `putArchive`.
`getArchive` reads are unchanged (they work under Bun).

**Known follow-up:** the snapshot-restore path (the remaining `putArchive` in
`docker-sandbox.ts`) has the *same* latent 501 under Bun and needs the same CLI
treatment (or `docker cp`) before object-store snapshots are relied on in prod —
out of scope for STORY-26 (file save).
