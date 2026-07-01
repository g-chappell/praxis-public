# Runbook: sandbox base image

`praxis-sandbox-base` is the Docker image every project sandbox is created from
(see `infrastructure/docker/sandbox-base/Dockerfile`, ADR-0007). `DockerSandbox`
(`packages/sandbox`) does `createContainer({ Image: 'praxis-sandbox-base:latest', … })`,
so the image **must exist on whatever host runs the sandboxes** (the VPS).

Contents: `node:20-bookworm` + git, build-essential, python3, inotify-tools
(powers `watchFiles`), the Claude Code CLI (`@anthropic-ai/claude-code`) + the
ACP adapter, and the **image-gen MCP server** (STORY-15) — an esbuild bundle at
`/opt/praxis-mcp/image-gen/index.mjs` exposed on PATH as `praxis-mcp-image-gen`
(the command a seeded project `.mcp.json` invokes; ADR-0018). No secrets are in
the image — the OpenAI key arrives at runtime via the orchestrator's ephemeral
cred file (`PRAXIS_MCP_CONFIG`).

## Build / refresh

```bash
# Build context is the REPO ROOT (the image bundles infrastructure/mcp-servers/
# image-gen, which sits outside the Dockerfile's own directory).
docker build -t praxis-sandbox-base:latest -f infrastructure/docker/sandbox-base/Dockerfile .
```

> ⚠️ The context changed from `infrastructure/docker/sandbox-base` to the repo
> root in TASK-044 (so the bundled MCP server source is visible). Old muscle-
> memory / scripts using the directory-as-context form will fail to find the
> server source. Both CI workflows (`ci.yml` `integration`, `build-sandbox-base.yml`)
> were updated to the `-f … .` form.

Rebuild when the Dockerfile changes, when `infrastructure/mcp-servers/image-gen/`
changes (the bundled server), or to pick up a newer Claude Code CLI. There is no
app state in the image — project files live in per-project Docker volumes
(`praxis-project-<id>`), not the image. Smoke-check after building:
`docker run --rm praxis-sandbox-base:latest which praxis-mcp-image-gen`.

## Resource limits (per project_plan.md §6)

Applied by `DockerSandbox` via `HostConfig`, not the image:

- **Memory:** 2 GB (`Memory`) — enforced.
- **CPU:** 1 core (`NanoCpus`) — enforced.
- **Disk:** 5 GB (`StorageOpt.size`) — **only enforced on storage drivers that
  support it (xfs + pquota).** The current VPS uses overlayfs, where StorageOpt
  is silently ignored, so the disk cap is best-effort. `DockerSandbox` leaves it
  off by default (`diskLimit` config opt-in) to avoid failing container creates.
  Revisit if/when the host moves to an xfs-backed Docker root.

## Snapshot persistence (MinIO)

Idle sandboxes are stopped and removed after 30 min (the orchestrator's idle
sweep). Before removal, `DockerSandbox` tars `/workspace` and PUTs it to an
`ObjectStore` (ADR-0008); on the next `start()` with a fresh volume it restores
from there. The backend is MinIO, configured from env (read by
`MinioObjectStore.fromEnv()`):

| Env var | Notes |
| --- | --- |
| `MINIO_ENDPOINT` | host (no scheme), e.g. `minio` on `praxis-net` |
| `MINIO_PORT` / `MINIO_USE_SSL` | optional |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | credentials |
| `MINIO_BUCKET` | default `praxis-sandboxes` (one bucket, key per project) |

With these unset the orchestrator logs `persistence: none` and falls back to
local-volume persistence only (state survives restart on the same host, but not
a volume prune / host rebuild).

## Operator follow-ups (per host)

- [ ] Build the image on the VPS (command above) before the orchestrator starts
      creating sandboxes. CI builds it for the integration tests but does not
      push it; for prod, either build on the VPS or add a GHCR push + pull step
      when the orchestrator's sandbox path lands. The `build-sandbox-base.yml`
      workflow rebuilds it on the VPS on pushes to `main` that touch the
      Dockerfile or `infrastructure/mcp-servers/image-gen/`.
- [ ] **(STORY-15) Rebuild + redeploy `sandbox-base`** after this lands so the
      bundled image-gen server is present, then **paste the OpenAI platform key
      in `/admin`** (if not already). Without both, image generation is disabled
      (the orchestrator seeds no MCP config — clean degrade). Optional:
      `PRAXIS_MCP_USAGE_URL` in `/etc/praxis/praxis.env` (defaults to
      `http://praxis-orchestrator:4001/internal/mcp/usage`).
- [ ] **Provision MinIO** (container + bucket) and add `MINIO_*` to
      `/etc/praxis/praxis.env` to enable durable snapshots. Until then,
      persistence is volume-only.
- [ ] (Later) Network egress allowlist — deferred to STORY-19 / TASK-053, not
      yet applied to sandbox containers.

## Setup history

- **STORY-07 / TASK-022:** image introduced; `DockerSandbox` implements the §6
  `Sandbox` interface against it. Integration tests (`RUN_DOCKER_TESTS=1`) run in
  CI's `integration` job, which builds this image on the runner.
