# Conventions — orchestrator & sandbox runtime

Read this before touching `services/orchestrator` or the container-I/O
paths in `packages/sandbox`. These rules are tech-coupled to one fact:
**the orchestrator runs on Bun, not Node**, and Bun's HTTP client does not
behave like Node's under `dockerode`.

## The Bun ↔ dockerode rule (the one that keeps biting)

`dockerode` speaks to the Docker daemon over HTTP. Its **simple unary
calls** work fine under Bun — `inspect`, `create`, `start`, `stop`, `rm`,
`listContainers`, `exposePort`-style port lookups. Its **streaming /
hijacked-stream operations do not**: Bun rejects the chunked
request/response hijack with `501 Unsupported transfer encoding`.

Two confirmed failures this cost us real debugging time on:

| dockerode op | Symptom under Bun | Use instead | ADR |
|---|---|---|---|
| hijacked `exec` (attach stdin/stdout stream) | `501 Unsupported transfer encoding` | `docker exec [-i]` via the CLI | ADR-0010 |
| `putArchive` (tar upload — `writeFile`, template seed) | `501 Unsupported transfer encoding` | `writeFile` → `docker exec -i … tee`; seeding → `docker cp` | ADR-0014 |

**Rule:** for any sandbox **stream I/O** under Bun — writing files,
reading large output, seeding, anything that hijacks the connection —
**shell out to the `docker` CLI** (it's in the orchestrator image). Reserve
`dockerode` for the unary lifecycle calls. Do **not** reintroduce
`putArchive` or hijacked `exec`; they pass unit tests that mock the daemon
and only fail against a real daemon under Bun, i.e. at runtime in prod.

When adding a new sandbox capability, prove it against a **real daemon
under Bun** (boot the prod image, `RUN_DOCKER_TESTS=1`), not just Node
locally — Node won't reproduce the 501.

## Docker socket permissions

The orchestrator container runs as the non-root `bun` user (gid 1000); the
mounted socket is `root:docker` mode `0660`. Without the docker gid the
daemon calls fail with a misleading `"typo in the url or port?"`. The unit
grants access via `--group-add <docker-gid>` — see `deploy.md` and the
orchestrator `.service`. A socket-perms change needs a real container cycle
to verify (it only fails at runtime).

## Sandbox networking

Sandboxes must join the network in `PRAXIS_NETWORK` or the preview proxy can't
reach `sandbox:<port>` and every preview 502s. Required in the env-file on
the VPS — see `deploy.md`.

### Egress allowlist (STORY-19 / ADR-0021)

Sandboxes get an **outbound allowlist** via a forward proxy: set
`PRAXIS_NETWORK=praxis-sandbox-net` (an `internal` network — no route out) and
`PRAXIS_EGRESS_PROXY_URL=http://praxis-egress:3128`. The orchestrator then injects
`HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` into every sandbox container, so HTTP(S) goes
through `praxis-egress` (default-deny; allowlist in
`infrastructure/docker/egress-proxy/allowlist`) and anything not allowlisted has
**no route out** (the internal net is the fail-closed backstop). The proxy is
dual-homed (internal + external) and the **orchestrator must also attach to
`praxis-sandbox-net`** so it can still reach previews. `NO_PROXY` carries loopback
+ any in-cluster host the sandbox calls back to (e.g. `PRAXIS_MCP_USAGE_URL`'s
host) via `PRAXIS_EGRESS_NO_PROXY`. **Operator follow-ups + verify steps:**
`infrastructure/docker/egress-proxy/README.md`. Leaving `PRAXIS_EGRESS_PROXY_URL`
unset (dev) keeps egress unrestricted, as before.

> **Live-verify (deploy-layer):** the allowed-vs-blocked behaviour and that the
> agent reaches Anthropic *through the proxy* are real-Docker facts — confirm on
> the VPS post-deploy (the agent's HTTP client must honor `HTTPS_PROXY`; if it
> doesn't, see the ADR-0021 fallback). The `egress.integration.test.ts` proves
> the proxy mechanism with a real sandbox under `RUN_DOCKER_TESTS=1`.

## Preview routing

The orchestrator **is** the preview router (ADR-0015): one static Caddy
wildcard (`*.preview.<domain>`) reverse-proxies to `:4001`, and the
orchestrator maps `<slug>.preview.<domain>` → the sandbox container IP via
an in-memory registry, gated by on-demand-TLS `/caddy/ask`. We do **not**
mutate the shared multi-tenant Caddy dynamically.

### Preview HMR WebSocket (STORY-30)

The HTTP preview proxy (`preview.ts`) can't carry a WebSocket upgrade (it strips
`upgrade`), so Vite's HMR socket is tunnelled separately. `index.ts` intercepts a
**preview-host WS upgrade** before the Hono app and accepts it with a raw Bun
`server.upgrade` (so it can echo the `vite-hmr` subprotocol), then `preview-ws.ts`
opens a client `WebSocket` to the sandbox dev server and relays frames both ways.
One Bun `websocket` handler dispatches preview tunnels vs the Hono session socket
by `ws.data.kind`. Caddy passes the upgrade through unchanged.

Templates must point Vite's HMR client at the proxy, not the dev server's own
port — the preview is `https://<slug>.preview.<domain>` (Caddy TLS on 443):

```ts
// vite.config.ts
server: {
  host: '0.0.0.0', port: 5173, strictPort: true,
  allowedHosts: true,                       // dynamic per-project preview host
  hmr: { clientPort: 443, protocol: 'wss' },// connect back over the proxy, not :5173
}
```

`allowedHosts: true` is safe — the dev server is only reachable via the
authenticated proxy on `praxis-net`, never published publicly. The HMR tunnel is
generic infra and stays, but see the next section: the POC template opts out of
live HMR.

### Preview updates are turn-gated, not live-HMR (STORY-30 follow-up)

Live HMR flashed the preview on the agent's **mid-turn file churn** — the agent's
HOME is `/workspace/.praxis-agent` (ADR-0017), so Vite full-reloaded on every
store write. Operator preference: the preview should hold steady while the agent
works and update **once when the turn finishes**. So:

- `react-threejs-scene` `vite.config` sets **`hmr: false`** in the sandbox (no
  autonomous reload; `PRAXIS_LOCAL=1` keeps localhost HMR for standalone dev).
- `PreviewPane` reloads the iframe on the **`turn-complete`** `agent_event`, and
  only if a `file_changed` arrived during the turn (`file_changed` already excludes
  `.praxis-agent`, STORY-36) — so no reload on a no-op turn, no flash on churn.

## Agent memory store location (STORY-36 / ADR-0017)

The in-sandbox agent (`claude-agent-acp` wrapping `@anthropic-ai/claude-code`)
stores its **config + session history under `$HOME`** — verified on
`praxis-sandbox-base:latest` (claude-code 2.1.160): `$HOME/.claude.json` and
`$HOME/.claude/` (the latter holds `projects/<cwd-hash>/*.jsonl` transcripts
that ACP `session/load` reads). **Setting `HOME` relocates the whole store**
(the third-party "`~/.local/share/claude`" claim is wrong for this version).

So for durable cross-session memory we spawn the agent with
`HOME=/workspace/.praxis-agent` — a hidden dir under the persisted project
volume (named volume + MinIO snapshot, ADR-0008), so the store survives a
teardown for free. Because it lives inside `/workspace`, it is **excluded from
the file list, the file-watcher broadcast, and the sandbox `.gitignore`** so it
never leaks into the user's tree, `file_changed` stream, or commits. Project
delete purges it with the volume. (Aside: claude-code also writes a cwd-relative
`/workspace/backups/` dir on its own — pre-existing, unrelated.)

## MCP servers in the sandbox (STORY-15 / ADR-0018)

How to give the in-sandbox agent an MCP tool **without touching `packages/acp-host`**
(the sacred ACP layer). Verified by spike against the real `sandbox-base` image
(Claude Code 2.1.160, `claude-agent-acp@0.39.0`):

- The adapter runs the Claude Agent SDK with `settingSources: ["user","project","local"]`,
  so Claude Code reads a **project `.mcp.json`** from the cwd (`/workspace`). `acp-host`
  keeps `mcpServers: []` — don't change it.
- A `.mcp.json` alone is **⏸ Pending approval** (headless can't approve). It connects
  only with `/workspace/.claude/settings.json` = `{"enableAllProjectMcpServers": true}`
  (or `{"enabledMcpjsonServers":["<name>"]}`). Seed **both** at project creation.
  Claude Code spawns the server itself as a stdio child — no orchestrator sidecar.
- Confirm with `claude mcp list` inside a `sandbox-base` container (`✓ Connected`).
- The server binary is **baked into `sandbox-base`** (bundled, an esbuild single
  file at `/opt/praxis-mcp/image-gen/index.mjs` exposed on PATH as
  `praxis-mcp-image-gen`), not seeded into `/workspace` — platform infra stays
  out of the user's git.
- **As-built (TASK-044):** `services/orchestrator/src/mcp-seed.ts` writes `.mcp.json`
  + `.claude/settings.json` (read-merged) via `Sandbox.writeFile`, gated on the
  template's `template.json` `mcp_servers` declaring the server **and** an OpenAI
  key being configured. `.mcp.json`'s `command` is `praxis-mcp-image-gen`, with a
  non-secret `env.PRAXIS_MCP_CONFIG` pointing the server at the cred file below.

### Sandbox secret-handling (don't leak platform secrets into user space)

- **No platform creds in the sandbox env or `/workspace`.** A `.mcp.json` is committed
  to the user's git and snapshotted to MinIO, so it must carry **no secrets** (use it
  only for the command/args). The `.praxis-agent` dir is git-excluded but *is* in the
  `/workspace` MinIO snapshot — also not safe for secrets.
- Deliver per-session secrets (e.g. the platform OpenAI key) via an **ephemeral file
  outside `/workspace`** (not git, not snapshotted), written with `Sandbox.writeFile`
  (an absolute path passes through verbatim), that the server reads on startup. As-built:
  `/run/praxis-mcp/config.json` = `{openaiApiKey, usageUrl, usageToken}`, named to the
  server via `.mcp.json`'s `env.PRAXIS_MCP_CONFIG`. `/run` is ephemeral — re-seeded each
  time `createProjectRoom` runs; a bare `docker restart` (not via the orchestrator) would
  leave it stale.
- **No DB creds in the sandbox.** For sandbox→platform operations (usage capping), the
  in-sandbox process calls a **token-gated orchestrator endpoint** (`POST /internal/mcp/usage`)
  with a per-room capability token (`runtime.ts`) that resolves to exactly one project —
  the orchestrator owns the DB. Fail **closed** on a paid-API guard. The endpoint host is
  `PRAXIS_MCP_USAGE_URL` (default `http://praxis-orchestrator:4001/internal/mcp/usage` on
  `praxis-net`).

### Platform keys are captured per-session; the MCP cred file is seeded then

The decrypted platform keys (Anthropic `apiKey`, optional OpenAI `openaiKey`) are
captured **when a project's session room is first created** (`createProjectRoom` /
`getOrCreateRoom` in `routes/sessions.ts`) and **held for that room's lifetime** —
the first creator's keys win; a later joiner's (or a freshly-rotated admin key) does
**not** swap in. The image-gen MCP cred file (`/run/praxis-mcp/config.json`) is
written only at room creation. **So rotating a platform key in admin does not
affect an already-open session** — it keeps the old key (this surfaced as an
image-gen 401 after a key fix). Fix: get a **fresh room** (stop the sandbox or let
it idle-shutdown ~30 min, then reopen) so the orchestrator re-decrypts and re-seeds.

### image-gen MCP has no custom base-URL

`infrastructure/mcp-servers/image-gen` hardcodes `new OpenAI({ apiKey })` against
`api.openai.com` with model `gpt-image-1` — **no base-URL / Azure support**. A
university/Azure/gateway OpenAI key (different format, its own endpoint) can't work
here even if valid; supporting it needs a base-URL plumbed end-to-end (admin → cred
file → `config.ts` → client) + the endpoint added to the egress allowlist. Admin
key validation is **format-only** (`sk-`/`sk-ant-` prefix, a typo guard, not a
liveness check) — a format-valid-but-wrong key still 401s at runtime.
