# 0008 — Sandbox snapshots via an ObjectStore (MinIO)

**Date:** 2026-06-01
**Status:** Accepted

## Context

Idle sandboxes are stopped and their containers removed after 30 minutes
(project_plan.md §6, TASK-023). Project files live in per-project Docker volumes
(`praxis-project-<id>`), which survive a container removal — but only on the
same host, and only until the volume is pruned or the VPS is rebuilt. The POC
needs durable project state that outlives both the container and the host,
without coupling the `Sandbox` interface (ADR-0007) to a storage backend.

## Decision

Introduce an `ObjectStore` interface in `packages/sandbox`
(`putSnapshot`/`getSnapshot`/`hasSnapshot`) and wire snapshot/restore into
`DockerSandbox`:

- **On `stop()`** (including the idle sweep): tar `/workspace` out of the
  container and PUT it to the store, *then* remove the container.
- **On `start()`**: if the volume is empty (fresh project, or the local volume
  was reclaimed) and a snapshot exists, restore it before returning the handle.
  A populated volume is left untouched — so normal restarts are cheap and only
  genuine loss triggers a restore.

Implementations:
- **`MinioObjectStore`** — the POC backend (MinIO, S3-compatible), configured
  from `MINIO_*` env via `fromEnv()`. **One bucket, one object per project**
  (`<projectId>/workspace.tar`) rather than the task's literal "bucket per
  project" — fewer buckets, same isolation, and S3/GCS swap-in stays trivial.
- **`InMemoryObjectStore`** — used by tests (the AC stubs object storage) and as
  a safe no-persistence default when `MINIO_*` is unset.

Persistence is opt-in: `DockerSandbox` without a `store` just stops/removes
(local volume only). The orchestrator builds the store from env, so an
unconfigured environment degrades to local-volume persistence, not a crash.

## Consequences

- Project state is durable across container/host loss once MinIO is provisioned.
- A new external dependency (MinIO) and operator setup: run the MinIO container,
  create/point at a bucket, set `MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET` in
  `/etc/praxis/praxis.env`. Until then persistence is volume-only (logged at
  boot as `persistence: none`).
- Snapshots are whole-`/workspace` tarballs — fine at POC sizes; large projects
  may later want incremental/CoW snapshots (a future ADR).
- Swapping MinIO for S3/GCS is a new `ObjectStore` implementation + env, no
  consumer change — same reversibility bet as the Sandbox interface.

## Alternatives considered

- **Local volumes only.** Simplest, but loses state on host rebuild/prune — the
  exact durability the §6 "restore from object storage" line calls for.
- **Bucket-per-project (literal task body).** More buckets to manage and
  lifecycle for no isolation benefit over per-project object keys in one bucket.
- **Commit/push to a git remote as the snapshot.** Conflates the user-facing git
  history (STORY-16) with infra persistence; rejected for muddling two concerns.
