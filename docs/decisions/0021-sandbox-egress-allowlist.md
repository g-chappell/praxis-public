# 0021 — Sandbox outbound egress allowlist via an internal network + forward proxy

**Date:** 2026-06-12
**Status:** Accepted

## Context

STORY-19 (deferred from STORY-07) requires restricting sandbox containers to an
outbound **allowlist** (Anthropic API, OpenAI API, npm, PyPI, GitHub read-only),
with no inbound except the preview port, per `docs/project_plan.md` §6. Today a
sandbox joins `praxis-net` (a normal Docker bridge) and has **unrestricted
outbound internet** — an agent (or a prompt-injected tool call) could exfiltrate
to or pull from any host. Network/resource policy is load-bearing security and
crosses the sandbox + infra + orchestrator-preview boundaries, so it gets an ADR.

Constraints that shape the choice:

- **Domain-level, not IP-level.** The allowlist targets (npm/PyPI/GitHub/Anthropic)
  sit behind CDNs whose IPs rotate; an IP allowlist is brittle and high-maintenance.
- **The agent must still reach Anthropic.** The Claude agent's HTTP client has to
  honor whatever egress path we pick, or sessions break.
- **Bun↔dockerode rule (ADR-0010/0014).** Streaming container ops run via the
  docker CLI; this design only changes container *config* (networks + env), which
  is a unary `createContainer` change — no streaming.
- **Preview inbound is already in-network.** `exposePort` publishes **no host
  port** — it returns the container's in-network IP:port, which the orchestrator
  reaches over the Docker network. So "no inbound except the preview port" is
  largely a property we already have (nothing is host-published); this ADR keeps
  it that way and removes the *external* route entirely.

## Decision

Put sandboxes on an **`internal: true` Docker network** (`praxis-sandbox-net`) —
which Docker gives **no NAT / no external route** — and bridge allowlisted egress
through a single **forward-proxy container**:

- The proxy (`praxis-egress`) is dual-homed: attached to `praxis-sandbox-net`
  (reachable by sandboxes) **and** to an externally-routed network. It runs a
  CONNECT/HTTP proxy that **allows only the allowlisted domains** and denies the
  rest. Config + allowlist live in `infrastructure/docker/egress-proxy/`.
- Sandboxes receive `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` in their container
  `Env` (so every `docker exec`/agent spawn inherits it; `-e` overrides for the
  platform key add to, not replace, the inherited env). `NO_PROXY` covers
  loopback + in-cluster hosts so the preview and intra-net traffic skip the proxy.
- **Defense in depth:** because `praxis-sandbox-net` is `internal`, a process that
  ignores the proxy env has *no route out at all* — the proxy is the only egress,
  and it allowlists. So a non-proxy-aware tool fails closed (blocked), not open.
- The **orchestrator** also attaches to `praxis-sandbox-net` so it can still reach
  each sandbox's preview IP:port (unchanged `exposePort` contract).

Allowlist (initial, POC-wide — no per-template policy): `api.anthropic.com`,
`api.openai.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`,
`github.com`, `codeload.github.com`, `objects.githubusercontent.com`,
`api.github.com`.

## Consequences

- Outbound is denied by default and allowed by domain — robust to CDN IP churn,
  and a leaked/injected tool can't exfiltrate to an arbitrary host.
- **Risk — the agent must honor `HTTPS_PROXY`.** Node's global `fetch` does not
  auto-route through `HTTPS_PROXY`; whether the ACP adapter / Claude Code does is
  verified live. If it does not, the fallback is a proxy-side transparent redirect
  (iptables REDIRECT of :443 to the proxy) or, narrowly, an Anthropic egress
  exception — captured as a follow-up, not a redesign (the network shape stays).
- Operator follow-ups (VPS): create `praxis-sandbox-net` (internal) + the external
  proxy net, run the `praxis-egress` proxy container, and attach the orchestrator
  to `praxis-sandbox-net`. Documented in the deploy runbook.
- Extending the allowlist is a one-line edit to the proxy allowlist file + a proxy
  reload — documented in `infrastructure/docker/egress-proxy/README.md`.
- Live-only verification: the allowed-vs-blocked behaviour and the agent's
  reachability are deploy-layer facts (real Docker + the real base image), so the
  story verifies on the VPS post-deploy, not from CI green.

## Alternatives considered

- **DNS-aware firewall sidecar (`NET_ADMIN` + ipset/iptables).** Resolves
  allowlisted domains and permits only those IPs; works for *all* traffic with no
  proxy-env dependency. Rejected for the POC as more moving parts (DNS refresh,
  ipset churn, a privileged sidecar per sandbox) for a marginal gain over the
  proxy + internal-net backstop. Revisit if the agent can't be made proxy-aware.
- **iptables allowlist by resolved IP.** Simplest to write but brittle — CDN IPs
  change under it and it needs constant re-resolution. Rejected.
- **Leave egress open (status quo).** Rejected — it's the security gap STORY-19
  exists to close.
