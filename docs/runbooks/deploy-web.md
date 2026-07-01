# Deploy: `apps/web` to the Praxis VPS

How `apps/web` runs in production: a Docker container managed by
systemd, fronted by **Caddy** at `praxis.blacksail.dev`, with TLS via
Caddy's built-in ACME client. Continuous-deploy is wired via
`.github/workflows/deploy-web.yml` (TASK-008).

This runbook covers **manual operations** on a configured host plus a
**setup-history** appendix for what was done to get here.

## Topology

```
                  https://praxis.blacksail.dev
                            │
                            ▼
                ┌──────────────────────────┐
                │  Caddy on :80 + :443     │   shared with three
                │  TLS via ACME            │   pre-existing tenants
                │  /etc/caddy/Caddyfile    │   (see ADR-0004)
                └────────────┬─────────────┘
                             │ HTTP, 127.0.0.1:3002
                             ▼
                  ┌──────────────────────┐
                  │  praxis-web.service  │
                  │  (systemd, Type=simple)│
                  └──────────┬───────────┘
                             │ docker run --rm
                             ▼
                  ┌──────────────────────┐
                  │  ghcr.io/g-chappell/ │
                  │  praxis-web:latest   │
                  │  Next.js standalone  │
                  │  on :3000 inside     │
                  └──────────────────────┘
```

Health endpoint: `http://127.0.0.1:3002/api/health` → `{"ok":true}`.
Caddy probes every 30s and parks an unhealthy upstream.

## Multi-tenant context

This VPS hosts `praxis.blacksail.dev` (host port `:3002`, this repo)
alongside three pre-existing tenant apps on `:3000`, `:3001`, and
`:4000`. The host's `/etc/caddy/Caddyfile` is composite: one block
per app. This repo owns the Praxis block
(`infrastructure/caddy/Caddyfile`); the other blocks are mirrored
from their respective external repos and are not Praxis's concern.

See **ADR-0004** for the migration history (nginx → Caddy, certbot →
Caddy ACME) and the port-allocation convention.

## Daily operations

### Status

```bash
sudo systemctl status praxis-web.service
docker ps --filter name=praxis-web
curl -sf http://127.0.0.1:3002/api/health    # local health probe
curl -sf https://praxis.blacksail.dev/api/health   # via Caddy
```

### Tail logs

```bash
journalctl -u praxis-web.service -f    # systemd-level (container start/stop)
docker logs -f praxis-web              # app-level (Next.js stdout)
```

### Force a redeploy without a new commit

```bash
sudo systemctl restart praxis-web.service
# ExecStartPre pulls :latest before each start.
```

### Roll back to a specific commit's image

Each successful CI deploy tags the image with both `:latest` and
`:sha-<short>`. To roll back:

```bash
# On the VPS, as root:
docker tag ghcr.io/g-chappell/praxis-web:sha-abc1234 \
           ghcr.io/g-chappell/praxis-web:latest
sudo systemctl restart praxis-web.service
```

### Update the Caddy block

The host Caddyfile is at `/etc/caddy/Caddyfile`. To pick up changes
from this repo's `infrastructure/caddy/Caddyfile`:

```bash
# Compare and copy the praxis block manually, then:
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

### Caddy didn't get a TLS cert

```bash
sudo journalctl -u caddy --since "10 minutes ago" | grep -iE 'acme|cert|tls'
```

Common causes: DNS A record not yet pointing at `72.61.207.12`, port
:80 blocked at the firewall (Let's Encrypt HTTP-01 challenge needs
it), Let's Encrypt rate-limit hit (5 certs per registered domain per
week).

## CI deploy workflow

`.github/workflows/deploy-web.yml` (added in TASK-008) runs on every
push to `main` that touches `apps/web/**`,
`infrastructure/deploy/praxis-web.service`, or the workflow file
itself. Two jobs:

1. **`build`** (GitHub-hosted `ubuntu-latest`): builds the image from
   `apps/web/Dockerfile` (context = repo root) and pushes to
   `ghcr.io/g-chappell/praxis-web` with tags `:latest`, `:sha-<short>`,
   `:main`.
2. **`deploy`** (`needs: build`, runs on the **self-hosted runner on
   the VPS**, label `praxis-vps`): runs `sudo systemctl restart
   praxis-web.service` **locally** (no SSH) — the unit's `ExecStartPre
   docker pull` rolls to `:latest`. The sudo is allowed by the narrow
   sudoers fragment (`/etc/sudoers.d/praxis-deploy`). Then it
   smoke-tests `https://${{ vars.WEB_DOMAIN }}/api/health` (retried up
   to ~60s) and fails the job if non-200.

> **Why self-hosted, not SSH-push.** GitHub-hosted runners get a fresh
> Azure egress IP per job; some of those intermittently can't traverse
> the path to the Hostinger VPS on :22 (silent `connect timed out`,
> SYN never reaches sshd), and a runner keeps one IP for the whole job
> so in-job retries can't recover. Running the deploy step *on* the box
> removes the internet hop entirely. GitHub still reports the job
> success/failure, so notifications stay native. The old
> `VPS_SSH_KEY`-based SSH push (and its retry wrapper, #140/#143) was
> replaced; the `VPS_*` secrets are now unused by web/orchestrator
> deploys. See ADR-0011.

Restart, not reload, on the literal `systemctl` verb — see the
ADR-0001 and **ADR-0004** note about Caddy's upstream-retry buffer
covering the brief restart gap.

---

## Setup history (one-time work, done 2026-05-31)

This section records what was done to get the host into its current
state. Most steps are not idempotent and shouldn't be re-run on a
configured host. Kept here for audit and reproducibility.

### What was already there

- Ubuntu 24.04 LTS with `sudo`, Docker, `gh`, `node` available.
- **nginx** serving Colonize, Pirate-Battle, Dashboard with certbot-
  managed Let's Encrypt certs.
- **Caddy** package installed but service failed to start (port
  collision with nginx).

### What changed

1. **Migrated nginx → Caddy** (see ADR-0004). All four apps now
   served by Caddy from a single `/etc/caddy/Caddyfile`. Approx 5s
   downtime on the existing three apps during the swap.

2. **certbot retired.** Caddy's ACME client issues + renews. certbot
   timer + cron disabled. `/etc/letsencrypt/` left in place (dormant)
   for the audit trail. POSIX ACL `setfacl -R -m u:caddy:rX
   /etc/letsencrypt/{live,archive}` was applied to allow the brief
   period when Caddy was using existing certs; once certbot is
   uninstalled this can be revoked.

3. **`praxis-web` image** built and pushed to
   `ghcr.io/g-chappell/praxis-web` from the VPS (auth via
   `gh auth token`) for tags `:latest` and the initial `:sha-<short>`
   build. Root is logged into GHCR via that token; the systemd unit's
   `ExecStartPre docker pull` uses that auth. (The GHCR package is
   private — flipping it public requires the GitHub web UI for
   user-owned packages.)

4. **systemd unit** for `praxis-web.service` installed at
   `/etc/systemd/system/praxis-web.service` (mirrors
   `infrastructure/deploy/praxis-web.service` in this repo) and
   enabled. Container binds host port `:3002` AND joins the
   `praxis-net` Docker network so it can reach `praxis-db` by
   hostname. Reads `/etc/praxis/praxis.env` via `--env-file` —
   see the "two conventions" note in `deploy-postgres.md` about
   that file's format (ASCII-only, no inline comments).

5. **Deploy user** for the CI workflow:

   ```bash
   sudo useradd --create-home --shell /bin/bash deploy
   sudo mkdir -p /home/deploy/.ssh
   sudo chmod 700 /home/deploy/.ssh
   sudo chown -R deploy:deploy /home/deploy/.ssh
   sudo usermod -aG docker deploy
   ```

6. **Sudoers fragment** `/etc/sudoers.d/praxis-deploy`:

   ```
   deploy ALL=(root) NOPASSWD: /bin/systemctl restart praxis-web.service, /bin/systemctl reload caddy.service
   ```

   Chmod 0440, validated with `visudo -c`.

7. **GitHub Actions secrets and variable** set via `gh secret set`
   and `gh variable set` from the VPS:

   | Name | Type | Value |
   |---|---|---|
   | `VPS_HOST` | secret | `72.61.207.12` |
   | `VPS_USER` | secret | `deploy` |
   | `VPS_SSH_KEY` | secret | (operator pastes via GH web UI; see below) |
   | `WEB_DOMAIN` | variable | `praxis.blacksail.dev` |

### What the operator still needs to do

Three items the executor cannot do from the VPS:

1. **DNS** — add an `A` record for `praxis.blacksail.dev` pointing
   at `72.61.207.12`. Optionally an `AAAA` record for
   `2a02:4780:f:a2e2::1` so IPv6 visitors reach Praxis too. Caddy
   will issue the TLS cert on the first request that lands after DNS
   propagates.

2. **SSH keypair for the `deploy` user** — generated on a workstation
   (private key never lands on the VPS):

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/praxis-deploy -N '' -C 'praxis-deploy'
   ```

   Paste the public key (`~/.ssh/praxis-deploy.pub`) somewhere the
   executor (or operator) can append to
   `/home/deploy/.ssh/authorized_keys` (chmod 600, chown
   deploy:deploy).

   Paste the **private** key (`~/.ssh/praxis-deploy`) into the
   `VPS_SSH_KEY` GitHub Actions secret via the web UI at
   <https://github.com/g-chappell/praxis/settings/secrets/actions>.

3. **GHCR package visibility (optional)** — make
   `ghcr.io/g-chappell/praxis-web` public via
   <https://github.com/users/g-chappell/packages/container/praxis-web/settings>
   so the VPS pulls don't need a GHCR-authenticated docker client.
   Functional today (root is logged in via `gh auth token`); switch
   to public for robustness.

After items 1 and 2 are complete, TASK-008's CI workflow can land green.

### Self-hosted runner (added 2026-06-02, ADR-0011)

Deploys moved off SSH-push to a self-hosted GitHub Actions runner on the
VPS (ADR-0011). One-time install, done as root, runner runs as `deploy`:

```bash
sudo -u deploy bash -c '
  cd /home/deploy && rm -rf actions-runner && mkdir actions-runner && cd actions-runner
  curl -sSL -o r.tgz https://github.com/actions/runner/releases/download/v2.334.0/actions-runner-linux-x64-2.334.0.tar.gz
  tar xzf r.tgz && rm r.tgz'
# Registration token is short-lived; mint it fresh:
RT=$(gh api -X POST repos/g-chappell/praxis/actions/runners/registration-token --jq .token)
sudo -u deploy /home/deploy/actions-runner/config.sh \
  --url https://github.com/g-chappell/praxis --token "$RT" \
  --name praxis-vps --labels self-hosted,praxis-vps --work _work --unattended --replace
cd /home/deploy/actions-runner && sudo ./svc.sh install deploy && sudo ./svc.sh start
```

Daily ops:

```bash
sudo /home/deploy/actions-runner/svc.sh status     # health
gh api repos/g-chappell/praxis/actions/runners --jq '.runners[]|"\(.name) \(.status) busy=\(.busy)"'
sudo /home/deploy/actions-runner/svc.sh stop|start # restart the listener
```

No new privileges: `deploy` was already in `docker` and had NOPASSWD sudo for
the `systemctl restart praxis-*` commands. If the runner is offline, deploy
jobs queue until it returns; `svc.sh start` (or `systemctl start
actions.runner.g-chappell-praxis.praxis-vps.service`) brings it back.

The SSH-push path was retired with this change: the `VPS_HOST` / `VPS_USER` /
`VPS_SSH_KEY` GitHub Actions secrets were **deleted 2026-06-02** (no workflow
references them), so the "SSH keypair for the `deploy` user" operator step
above and the `VPS_*` rows in the secrets table are historical only. The
`deploy` user's `~/.ssh/authorized_keys` entry for CI is now dormant.
