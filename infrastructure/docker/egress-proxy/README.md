# praxis-egress — sandbox outbound allowlist proxy

The forward proxy that enforces the sandbox **egress allowlist** (ADR-0021 /
STORY-19). Sandbox containers run on the internal `praxis-sandbox-net` (no route
out) and reach the internet only through this proxy, which is **default-deny**:
only hosts matching `allowlist` are permitted, for plain HTTP and HTTPS CONNECT.

## How it fits together

- `praxis-sandbox-net` — an `internal` Docker network. Containers on it have no
  NAT to the outside, so the proxy is their only egress and a non-proxy-aware
  process fails closed (blocked), not open.
- `praxis-egress` — this container, **dual-homed**: on `praxis-sandbox-net` (so
  sandboxes reach it) and on an externally-routed network (so it can reach the
  allowlisted hosts).
- Sandboxes get `HTTPS_PROXY=http://praxis-egress:3128` (+ `HTTP_PROXY`/`NO_PROXY`)
  injected by the orchestrator via `PRAXIS_EGRESS_PROXY_URL` (see
  `services/orchestrator/src/runtime.ts`). The orchestrator also attaches to
  `praxis-sandbox-net` so it can still reach each sandbox's preview port.

## Extending the allowlist

Add a line to [`allowlist`](./allowlist) — one anchored POSIX-extended regex per
line, matched case-insensitively against the request host. Anchor with `^…$` so a
pattern can't match an attacker-controlled suffix (`api.anthropic.com.evil.test`).
Then reload the proxy without dropping connections:

```bash
docker kill -s HUP praxis-egress     # tinyproxy re-reads its filter on SIGHUP
```

(Rebuild + restart the container if you changed `tinyproxy.conf` or the Dockerfile.)

## Build / run (one-time, on the VPS)

```bash
docker network create --internal praxis-sandbox-net          # internal: no route out
docker build -t praxis-egress infrastructure/docker/egress-proxy
docker run -d --name praxis-egress --restart unless-stopped --network praxis-sandbox-net praxis-egress
docker network connect praxis-net praxis-egress              # external route for the proxy
docker network connect praxis-sandbox-net praxis-orchestrator # so the orchestrator reaches previews
```

Then point the orchestrator at it (env file):

```
PRAXIS_NETWORK=praxis-sandbox-net
PRAXIS_EGRESS_PROXY_URL=http://praxis-egress:3128
```

## Verify

```bash
# Allowed (expect 200) and denied (expect "CONNECT tunnel failed, response 403"):
docker run --rm --network praxis-sandbox-net -e HTTPS_PROXY=http://praxis-egress:3128 \
  --entrypoint sh praxis-egress -c 'curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/'
docker run --rm --network praxis-sandbox-net -e HTTPS_PROXY=http://praxis-egress:3128 \
  --entrypoint sh praxis-egress -c 'curl -sS -o /dev/null https://example.com/ || echo blocked'
```
