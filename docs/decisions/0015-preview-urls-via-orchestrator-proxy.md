# ADR-0015: Per-project preview URLs via a static Caddy wildcard → orchestrator proxy

## Status

Accepted (2026-06-03)

## Context

STORY-13 gives each project a public preview URL for its in-sandbox dev server
(e.g. the 3js template's Vite on :5173). The roadmap framed it as a Caddy
`*.preview.<domain>` wildcard with on-demand TLS, where the orchestrator
registers/deregisters sandbox upstreams as sessions come and go.

The hard constraint: **Caddy on this VPS is a shared, multi-tenant host service**
(ADR-0004). Its config is a hand-edited composite `/etc/caddy/Caddyfile` serving
Praxis *and* other tenants; the admin API isn't exposed. Mutating it at runtime
(admin API route churn) to add/remove preview upstreams would risk other tenants'
config and couple sandbox lifecycle to live edits of a shared file.

Sandboxes run on the `praxis-net` bridge with internal IPs. The orchestrator is
also on `praxis-net`, so it can reach a sandbox container's IP:port directly.

## Decision

**Keep Caddy static; make the orchestrator the dynamic preview router.**

- **Caddy** (added once, by hand, like the other blocks): a single
  `*.preview.praxis.blacksail.dev` site with `tls { on_demand }`, reverse-proxying
  **all** preview traffic to the orchestrator (`127.0.0.1:4001`). A global
  `on_demand_tls { ask http://127.0.0.1:4001/caddy/ask }` gates cert issuance.
- **Orchestrator** holds an in-memory `slug → { ip, port }` registry (slug = the
  projectId). It routes by `Host`:
  - `*.preview.<domain>` → look up the slug → HTTP reverse-proxy to the sandbox
    (`http://<ip>:<port>`), or 404 if not live.
  - `GET /caddy/ask?domain=…` → 200 iff the slug is live (the on-demand-TLS gate).
  - all other Hosts (api.\*, the ask call) fall through to the normal app.
- **Lifecycle:** session start registers the slug + writes `sessions.previewUrl`;
  session end deregisters → `/caddy/ask` 404 and the proxy 404s (URL revoked).
- `exposePort` is unchanged (still returns the sandbox's `http://<ip>:<port>` — a
  pure Sandbox concern); the Caddy/domain/registry logic lives in the orchestrator,
  so the `Sandbox` interface stays free of preview/Caddy specifics (ADR-0007).

## Consequences

- No runtime mutation of the shared Caddy — one static block, safe for other
  tenants. The dynamic part is all in the orchestrator (testable without the VPS).
- All preview HTTP flows through the orchestrator (a POC-acceptable bottleneck).
- **WebSocket (Vite HMR) is now tunnelled** (STORY-30): a preview-host WS upgrade
  is intercepted in `index.ts` and relayed to the sandbox dev server by
  `preview-ws.ts`, so the preview live-reloads. See
  `docs/conventions/orchestrator-runtime.md` → Preview HMR WebSocket.
- The registry is in-memory (single-instance POC); a multi-instance orchestrator
  would move it to Redis/Postgres alongside rooms/tickets.
- **Operator follow-ups:** wildcard DNS `*.preview.praxis.blacksail.dev`; merge the
  global `on_demand_tls ask` + add the wildcard block to the host Caddyfile;
  set `PREVIEW_DOMAIN`.

## Alternatives

- **Caddy admin API (dynamic routes).** Caddy proxies straight to the sandbox
  (WS-native), orchestrator manages routes. Rejected: mutating a shared,
  hand-managed, multi-tenant Caddy at runtime is risky, and the admin API isn't
  exposed to the orchestrator container.
- **Caddy `dynamic http` upstreams.** Not a standard built-in module; the built-in
  dynamic upstreams are DNS-based and Caddy (on the host) can't use Docker DNS.
- **Per-sandbox host port + a port-based scheme.** Burns host ports and leaks the
  topology; the wildcard is cleaner once DNS is in place.
