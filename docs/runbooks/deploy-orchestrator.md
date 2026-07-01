# Deploy: orchestrator on the Praxis VPS

How `services/orchestrator` runs in production: a Bun + Hono container
managed by systemd, on the shared `praxis-net` Docker network, fronted
by Caddy at `api.praxis.blacksail.dev`. Continuous-deploy is wired via
`.github/workflows/deploy-orchestrator.yml`.

This runbook mirrors the shape of `deploy-web.md` and `deploy-postgres.md`;
read those first for the shared multi-tenant context (Caddy composite,
GHCR linkage, sudoers conventions).

## Topology

```
                  https://api.praxis.blacksail.dev
                            │
                            ▼
                ┌──────────────────────────┐
                │  Caddy on :80 + :443     │   shared with praxis-web
                │  TLS via ACME            │   and three pre-existing
                │  /etc/caddy/Caddyfile    │   tenants (ADR-0004)
                └────────────┬─────────────┘
                             │ HTTP, 127.0.0.1:4001 (or WS upgrade)
                             ▼
                  ┌──────────────────────┐
                  │ praxis-orchestrator  │
                  │   .service           │
                  └──────────┬───────────┘
                             │ docker run --rm --network praxis-net
                             ▼
                  ┌──────────────────────┐
                  │  oven/bun:1.1-alpine │
                  │  + Hono routes       │
                  │  /health, /ws        │
                  │  reaches praxis-db   │
                  │  via Docker DNS      │
                  └──────────────────────┘
```

Health endpoint: `http://127.0.0.1:4001/health` → `{ ok: true, version,
gitSha, uptimeSec }`. Caddy probes every 30s; deploy workflow's smoke
test hits the public URL.

## Daily operations

### Status

```bash
sudo systemctl status praxis-orchestrator.service
docker ps --filter name=praxis-orchestrator
curl -sf http://127.0.0.1:4001/health
curl -sf https://api.praxis.blacksail.dev/health   # via Caddy
```

### Tail logs

```bash
journalctl -u praxis-orchestrator.service -f   # systemd-level
docker logs -f praxis-orchestrator             # pino JSON to stdout
```

In dev mode the pino-pretty transport renders human-readable lines; in
prod it's strict JSON for log shippers.

### Restart / redeploy

```bash
sudo systemctl restart praxis-orchestrator.service
# ExecStartPre pulls :latest before each start.
```

### Roll back to a specific commit's image

```bash
docker tag ghcr.io/g-chappell/praxis-orchestrator:sha-abc1234 \
           ghcr.io/g-chappell/praxis-orchestrator:latest
sudo systemctl restart praxis-orchestrator.service
```

### Update the Caddy block

The host file at `/etc/caddy/Caddyfile` is a hand-mirrored composite
(see ADR-0004). To pick up changes from this repo's
`infrastructure/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile          # paste/edit the api.* block
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

## CI deploy workflow

`.github/workflows/deploy-orchestrator.yml` triggers on push to `main`
that touches `services/orchestrator/**`, `packages/db/**`,
`infrastructure/deploy/praxis-orchestrator.service`, or the workflow
file itself. Two jobs:

1. **`build`** (GitHub-hosted): builds the image from
   `services/orchestrator/Dockerfile` (context = repo root;
   `--build-arg GIT_SHA=${{ github.sha }}` baked in so `/health` reports
   the commit) and pushes `:latest`, `:sha-<short>`, `:main` to
   `ghcr.io/g-chappell/praxis-orchestrator`.
2. **`deploy`** (`needs: build`, **self-hosted runner on the VPS**,
   label `praxis-vps`): runs `sudo systemctl restart
   praxis-orchestrator.service` **locally** (no SSH; the unit's
   `ExecStartPre docker pull` rolls to `:latest`), then smoke-tests
   `https://${{ vars.API_DOMAIN }}/health` (retried ~60s).

The deploy moved off SSH-push to the self-hosted runner — see
**ADR-0011** and the runner Setup-history / daily-ops in
`deploy-web.md`. The `VPS_*` secrets are no longer used.

### Troubleshooting: deploy stuck on `queued` (wedged runner)

Symptom: a PR merged, the `build` job went green (image pushed to GHCR), but
`/health` still reports the **old** `gitSha` — the `deploy` job sits `queued`
for many minutes and the live container never rolls. Seen after a *previous*
deploy failed mid-run (e.g. the disk-filled-up failure), which can leave the
self-hosted runner **"online but not dispatching"**: it answers the GitHub
listener yet never picks up the queued job.

Confirm it's the runner, not a real lock:

```bash
# The deploy job is queued with no competing run and the runner idle:
gh run view <run-id> --json jobs -q '.jobs[] | "\(.name) \(.status)"'   # build success, deploy queued
gh run list --limit 15 --json status -q '[.[]|select(.status=="in_progress" or .status=="queued")]|length'  # only this one
gh api repos/g-chappell/praxis/actions/runners -q '.runners[] | "\(.name) \(.status) busy=\(.busy)"'         # online busy=false
```

If the runner is `online busy=false` yet the job won't start, restart it — it's
idle, so nothing is lost; the queued job is grabbed within seconds:

```bash
sudo systemctl restart actions.runner.g-chappell-praxis.praxis-vps.service
# then watch it land:
gh run watch <run-id> --exit-status
curl -s https://api.praxis.blacksail.dev/health   # gitSha should now be the new commit
```

(If the original failure was a full disk — the common cause — also run
`infrastructure/deploy/praxis-hygiene.sh` first; see `docs/conventions/deploy.md`
→ Disk hygiene.)

---

## Setup history (one-time work, done 2026-06-01)

This section records what was done to get the host into its current
state. Most steps are not idempotent and shouldn't be re-run on a
configured host. Kept here for audit and reproducibility.

### What was added

1. **Shared Docker network `praxis-net`** — already existed from
   STORY-04. Nothing new here.

2. **systemd unit** at `/etc/systemd/system/praxis-orchestrator.service`
   (mirrors `infrastructure/deploy/praxis-orchestrator.service` in this
   repo) and enabled. Container binds host port `:4001`, joins
   `praxis-net`, reads `/etc/praxis/praxis.env` via `--env-file`.

   > **STORY-07 update — Docker socket.** The unit now mounts
   > `-v /var/run/docker.sock:/var/run/docker.sock` **and** `--group-add 988`
   > (the host `docker` group gid — confirm with `getent group docker`) so the
   > orchestrator can manage sandbox containers + run the idle sweep. Without
   > the group-add the container's non-root `bun` user can't read the socket
   > and the sweep logs `sandbox.sweep_failed`. The deploy workflow restarts
   > the service but does NOT copy the `.service` file, so after this lands you
   > must re-apply the unit on the VPS:
   > ```bash
   > sudo cp /opt/praxis/infrastructure/deploy/praxis-orchestrator.service /etc/systemd/system/
   > sudo systemctl daemon-reload && sudo systemctl restart praxis-orchestrator
   > docker inspect praxis-orchestrator --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' | grep docker.sock
   > ```
   > Verify: `docker logs praxis-orchestrator | grep sandbox` shows
   > `sandbox.idle_sweep_start` with no `sandbox.sweep_failed`. Security
   > caveat (root-equivalent host access) is noted in the unit file.

3. **Sudoers extension** at `/etc/sudoers.d/praxis-deploy` added the
   praxis-orchestrator restart grant alongside the existing entries:

   ```
   deploy ALL=(root) NOPASSWD: \
     /bin/systemctl restart praxis-web.service, \
     /bin/systemctl reload caddy.service, \
     /bin/systemctl restart praxis-postgres.service, \
     /bin/systemctl restart praxis-orchestrator.service
   ```

4. **Caddy block** for `api.praxis.blacksail.dev` appended to
   `/etc/caddy/Caddyfile` (host file is composite per ADR-0004).
   Caddy auto-handled WebSocket upgrades via the `reverse_proxy`
   directive — no extra config.

5. **GitHub Actions variable `API_DOMAIN=api.praxis.blacksail.dev`**
   added so the workflow's smoke test points at the right hostname.

### Install steps (re-run on a fresh VPS)

```bash
# 1. Network (idempotent; already there from STORY-04)
sudo docker network create praxis-net 2>/dev/null || true

# 2. Install unit
sudo cp infrastructure/deploy/praxis-orchestrator.service /etc/systemd/system/

# 3. Extend sudoers (see step 3 above)
sudo visudo -f /etc/sudoers.d/praxis-deploy

# 4. Append the Caddy block (see infrastructure/caddy/Caddyfile)
sudo nano /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy

# 5. Reload + enable
sudo systemctl daemon-reload
sudo systemctl enable --now praxis-orchestrator.service

# 6. Smoke test
curl -sf http://127.0.0.1:4001/health
curl -sf https://api.praxis.blacksail.dev/health
```

### Sandbox egress allowlist (STORY-19 / ADR-0021)

Done live 2026-06-13. Restricts sandbox outbound to an allowlist via an internal
network + forward proxy. The unit's `ExecStartPost` re-attaches the orchestrator
to `praxis-sandbox-net` on every start (no-op until the network exists). Full
provisioning + verify steps: `infrastructure/docker/egress-proxy/README.md`. In
short, on the VPS:

```bash
sudo docker network create --internal praxis-sandbox-net
sudo docker build -t praxis-egress infrastructure/docker/egress-proxy
sudo docker run -d --name praxis-egress --restart unless-stopped --network praxis-sandbox-net praxis-egress
sudo docker network connect praxis-net praxis-egress
# env-file: PRAXIS_NETWORK=praxis-sandbox-net, PRAXIS_EGRESS_PROXY_URL=http://praxis-egress:3128,
#           PRAXIS_EGRESS_NO_PROXY=praxis-orchestrator   (then daemon-reload + restart)
```

Verified: a sandbox reaches `api.anthropic.com`/`registry.npmjs.org` through the
proxy, an arbitrary host is blocked (CONNECT 403), and a real agent session
reaches Anthropic through the proxy. To extend the allowlist: edit
`egress-proxy/allowlist` + `docker kill -s HUP praxis-egress`.

### What the operator still needs to do

Three items the executor cannot do from the VPS:

1. **DNS** — add an `A` record for `api.praxis.blacksail.dev` pointing
   at `72.61.207.12`. Caddy will issue the TLS cert on the first
   request that lands after DNS propagates.

2. **GHCR package visibility (optional)** — make
   `ghcr.io/g-chappell/praxis-orchestrator` public via the package
   settings page so the VPS pulls don't need GHCR auth. Same pattern
   as `praxis-web`.

3. **GHCR package → repo link** — after the first workflow build,
   connect the package to the `praxis` repo via the package settings
   page so `GITHUB_TOKEN` retains write permissions for subsequent
   pushes.
