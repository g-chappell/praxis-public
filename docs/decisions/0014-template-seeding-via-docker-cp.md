# ADR-0014: Seed project templates into the sandbox via the orchestrator + docker cp

## Status

Accepted (2026-06-03)

## Context

`DockerSandbox.start` only ran `git init`, so a new project's `/workspace` was
empty — the agent had nothing to build from. STORY-27 adds template seeding:
copy a chosen template's files into a fresh workspace and make them the initial
git commit. Templates are repo data under `templates/<id>/` (a `blank` template
here; `react-threejs-scene` from STORY-14). The question is how the files reach
the sandbox container.

Constraints:
- The orchestrator runs on **Bun**; dockerode's streamed `putArchive` 501s under
  Bun (ADR-0010/0012), so a tar-upload approach is out.
- Consumers depend only on the `Sandbox` interface (ADR-0007); the web app must
  not touch Docker or read template files for the sandbox.

## Decision

**Seed from the orchestrator's filesystem via the `docker` CLI.**

- `DockerSandbox` gains a `templatesDir` config. On `start()` of a *fresh*
  workspace (empty AND no snapshot restored), it runs
  `docker cp <templatesDir>/<templateId>/. <container>:/workspace/` then
  `git init && git add -A && git commit` as the initial commit. Unknown template
  id (no dir) → skip, leaving an empty workspace (today's behaviour).
- `docker cp` is the **CLI** (child_process), Bun-safe like the rest of
  exec/spawn/writeFile (ADR-0010) — not dockerode putArchive.
- The **orchestrator ships the templates**: its Dockerfile `COPY templates ./templates`
  (→ `/app/templates`), and `runtime.ts` passes `templatesDir`
  (`PRAXIS_TEMPLATES_DIR` ?? `/app/templates`). Dev/tests point it at the repo
  `templates/`.

Chosen over **baking templates into the sandbox *base* image**: that would couple
template content to a manually-built base image (rebuild + repush to change a
template), whereas shipping them with the orchestrator means templates ride the
normal orchestrator auto-deploy. The `Sandbox` interface shape is unchanged
(`start(projectId, templateId)` already carries the id) — this is a DockerSandbox
implementation detail + a config field.

## Consequences

- New projects start from their template (blank → a README; others → their
  scaffold), as the initial commit. Verified by a Docker-gated test.
- Template changes ship via the orchestrator deploy (no sandbox base-image
  rebuild). **Operator follow-up:** the orchestrator image now contains
  `templates/`; nothing else to do (auto-deploy handles it).
- Seeding is skipped for populated/restored volumes, so resumes are untouched.
- The web template registry (picker + validation) and the on-disk `templates/`
  dirs must stay in sync (two ids today: `blank`, `react-threejs-scene`).

## Alternatives

- **Bake into the sandbox base image** (`COPY templates/ /templates/`, in-container
  `cp`): self-contained but needs a manual base-image rebuild/repush per template
  change and a build-context change. Rejected for POC ergonomics.
- **Per-file `writeFile` (tee)**: works but O(files) round-trips; `docker cp`
  bulk-copies a tree in one call.
- **dockerode `putArchive`**: 501s under Bun (ADR-0010/0012). Rejected.
