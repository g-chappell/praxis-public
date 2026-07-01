# Conventions — deploy

How services land on the Praxis VPS. Cookbook split out of `AGENTS.md`
tier-3 once these patterns earned their weight across STORY-02 (web),
STORY-03 (postgres), STORY-04 (auth), and STORY-05 (orchestrator).

The runbooks at `docs/runbooks/deploy-*.md` describe daily ops per
service. This file is the **cross-cutting rules** every new service
should follow so we don't drift.

## VPS shape

- **Single VPS, multi-tenant** (see ADR-0001, ADR-0004). Caddy at
  `:80` + `:443` terminates TLS and routes by hostname. The VPS also
  hosts unrelated apps from other tenants — see
  `/etc/caddy/Caddyfile` for the composite.
- **Shared Docker bridge `praxis-net`.** All Praxis containers join
  this network so inter-service traffic uses container hostnames
  (e.g. `DATABASE_URL=postgres://…@praxis-db:5432/praxis`) rather
  than host loopback. Containers cannot reach `127.0.0.1:<host-port>`
  on the VPS — `127.0.0.1` inside a container is the container itself.
- **systemd owns the container lifecycle.** Each service is one unit
  (`praxis-<service>.service`) that runs `docker run --rm` in the
  foreground. systemd's `Restart=on-failure` handles crashes; the
  unit's `ExecStartPre` pulls `:latest` so `systemctl restart` after
  a deploy picks up the new image.

## Port allocation on this VPS

Other tenants own some low ports — pick from the free range when
adding a new service.

| Host port | Owner | Notes |
|---|---|---|
| 3000 | pre-existing tenant | not Praxis |
| 3001 | pre-existing tenant | not Praxis |
| **3002** | `praxis-web` | Next.js standalone |
| 4000 | pre-existing tenant | not Praxis |
| **4001** | `praxis-orchestrator` | Bun + Hono (HTTP + `/ws`) |
| 5432 | `praxis-db` | Postgres 16, bound `127.0.0.1` only |

All Praxis service ports bind to `127.0.0.1` on the host — only Caddy
talks to them. Don't expose `0.0.0.0:<port>` even in dev on this host.

## Caddyfile composite

- The **host file** at `/etc/caddy/Caddyfile` is a composite of blocks
  from this repo and from other tenants on the VPS. It is **edited
  by hand** when a new block is added — not symlinked.
- This repo's blocks live at `infrastructure/caddy/Caddyfile`. When
  you add or change a block here, paste it into the host file:
  ```bash
  sudo nano /etc/caddy/Caddyfile
  sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  sudo caddy fmt --overwrite /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  ```
- CI runs `caddy validate` + `caddy fmt --diff` against
  `infrastructure/caddy/Caddyfile` so syntax breaks fail before merge.
- WebSocket upgrades work transparently through `reverse_proxy` — no
  extra directives needed.
- TLS is via Caddy's built-in ACME (Let's Encrypt). Cert storage is in
  `/var/lib/caddy/.local/share/caddy/`.

## Env-file format — `/etc/praxis/praxis.env`

All services read the same file via `docker run --env-file`. Format
rules are stricter than `bash` because Docker's parser is unforgiving:

- **ASCII only.** A single em-dash or smart-quote silently truncates
  every variable from that line onward. Don't paste from notes apps.
- **No inline comments.** `KEY=value # comment` becomes
  `KEY=value # comment` — the parser doesn't strip the `#` tail.
  Comments must be their own line starting with `#`.
- **`KEY=value`**, one per line, no quoting unless the value contains
  whitespace. Don't use `export`.
- Values with spaces or special chars: wrap in double quotes — Docker
  passes the unquoted string to the container env.

The canonical file lives at `/etc/praxis/praxis.env`. Mode `0640`,
owned `root:deploy` so the `deploy` user can read it for `docker run`
but other users can't.

**`PRAXIS_NETWORK=praxis-net` is required for previews.** The orchestrator passes
it to `DockerSandbox` as the sandbox container's network. If unset, sandboxes land
on the default `bridge`, isolated from the orchestrator (on `praxis-net`) — file
ops/agent still work (they use the Docker socket), but the preview proxy can't
reach `sandbox:<port>` and every preview 502s (STORY-13). ⚠ Security: this puts
untrusted agent sandboxes on `praxis-net` alongside `praxis-db` — harden via
STORY-19 (egress allowlist) or a dedicated sandbox network.

## systemd unit shape

Every Praxis service unit follows the same skeleton (see
`infrastructure/deploy/praxis-{web,orchestrator,postgres}.service` for
working examples):

```ini
[Unit]
Description=Praxis <service> container
After=docker.service network-online.target praxis-postgres.service
Requires=docker.service
Wants=network-online.target

[Service]
Type=simple
Restart=on-failure
RestartSec=5
TimeoutStopSec=20

ExecStartPre=-/usr/bin/docker rm -f praxis-<service>
ExecStartPre=/usr/bin/docker pull ghcr.io/g-chappell/praxis-<service>:latest

ExecStart=/usr/bin/docker run --rm --name praxis-<service> \
  --network praxis-net \
  --env-file /etc/praxis/praxis.env \
  -p 127.0.0.1:<port>:<container-port> \
  ghcr.io/g-chappell/praxis-<service>:latest

ExecStop=/usr/bin/docker stop praxis-<service>

[Install]
WantedBy=multi-user.target
```

- `--rm` so stopped containers don't accumulate.
- `--network praxis-net` so other Praxis containers can DNS-resolve
  the service.
- `--env-file` not `-e KEY=val` lines — secrets stay out of `ps` and
  systemd journals.
- Port binding always `127.0.0.1:<host>:<container>` — Caddy is the
  only public surface.
- Health-checking lives in the **image** (or Caddy's `health_uri`),
  not in systemd. systemd cares about "is the container running",
  not "is the app healthy".
- **A container that needs a second network needs an `ExecStartPost`.**
  `docker run --network X` joins exactly one network, and the unit
  **recreates the container every (re)start** — so a manual
  `docker network connect Y` is **lost on the next restart/deploy** and
  silently breaks whatever relied on network Y. Re-attach in the unit:
  `ExecStartPost=/bin/sh -c 'for i in 1 2 3 4 5; do docker network connect Y praxis-<service> 2>/dev/null && exit 0; sleep 1; done; exit 0'`
  (the retry covers the container-create race; `exit 0` makes it a no-op
  when Y is absent or already attached). The orchestrator uses this to
  reach sandbox previews on the internal `praxis-sandbox-net` (STORY-19).
  A VPS-local drop-in works but **put it in the repo unit** too, or a
  rebuild loses it.

CI validates new units with `systemd-analyze verify
infrastructure/deploy/*.service`.

## Secret handling + rotation on the VPS

The env-files at `/etc/praxis/*.env` hold live prod secrets (DB password,
`PRAXIS_MASTER_KEY`, `BETTER_AUTH_SECRET`, `ORCHESTRATOR_INTERNAL_SECRET`,
`RESEND_API_KEY`). **Never `cat` them** — printing values into a transcript is an
exposure (AGENTS.md tier-1). To edit: `grep -c`/`grep -l` for names, `sed -i` the
line (value interpolated from a `$(…)` var, never echoed), and confirm with the
masked URL (`sed -E 's|://([^:]+):[^@]*@|://\1:***@|'`).

**Rotation procedure** (all self-rotatable except `RESEND_API_KEY`, which is
issued by the Resend dashboard):

- **DB password** — `ALTER USER praxis WITH PASSWORD '<new>'` (local `psql` is
  trust-auth) + update `DATABASE_URL` (praxis.env) and `POSTGRES_PASSWORD`
  (praxis-postgres.env); restart web + orchestrator (existing pooled connections
  survive the `ALTER`; new ones need the restart).
- **`BETTER_AUTH_SECRET`** — new random; restart web. **Logs out all users.**
- **`ORCHESTRATOR_INTERNAL_SECRET`** — new random; web + orchestrator share
  praxis.env, restart both.
- **`PRAXIS_MASTER_KEY`** — must **re-encrypt at rest first**, then swap env. The
  key (XSalsa20-Poly1305 secretbox, base64 of 32 bytes — see `packages/crypto`)
  encrypts `oauth_tokens.{access,refresh}_token_encrypted`,
  `platform_api_keys.key_encrypted`, `mcp_connectors.credentials_encrypted`.
  Procedure: dump ciphertext via `psql`; a node script (libsodium, resolved via
  `createRequire('/opt/praxis/packages/crypto/package.json')`) decrypts with the
  OLD key + re-encrypts with the NEW, verifying each round-trips **before** apply;
  `UPDATE` in a transaction; then swap the env line and restart. Verify the live
  platform keys decrypt under the new key (print booleans, not values). Once
  re-encrypted + verified, the leaked old key is inert.

Back up the env-files first (`cp praxis.env praxis.env.bak-<ts>`, root-only) and
delete the loose new-secret copies once they're in the env-file.

## Sudoers fragment

The `deploy` user can restart Praxis services and reload Caddy
without a password — needed for the deploy step, which the self-hosted
runner runs as `deploy` (ADR-0011). Fragment lives at
`/etc/sudoers.d/praxis-deploy`:

```
deploy ALL=(root) NOPASSWD: \
  /bin/systemctl restart praxis-web.service, \
  /bin/systemctl restart praxis-orchestrator.service, \
  /bin/systemctl restart praxis-postgres.service, \
  /bin/systemctl reload caddy.service
```

Every new service appends one line. Validate with `visudo -c -f
/etc/sudoers.d/praxis-deploy` before saving — a syntax error here
locks deploys out.

## Docker image policy — GHCR

- **Registry:** `ghcr.io/g-chappell/praxis-<service>`.
- **Build context** is the **repo root** (not the service folder) so
  workspace packages (`packages/db`, `packages/shared`) are
  reachable. Each service's `Dockerfile` `COPY`s the workspaces it
  depends on explicitly — **manifest into the deps layer** (so
  `pnpm install` wires the symlink) **and source into the build layer**.
- **Tags pushed per build:** `:latest`, `:sha-<short>`, `:<branch>`
  (via `docker/metadata-action`). Rollback uses
  `docker tag <sha-tag> :latest && systemctl restart …`.
- **`GIT_SHA` build arg** — every Dockerfile takes
  `ARG GIT_SHA=dev`, the CI workflow passes the commit SHA, and the
  app reads it for `/health.gitSha`. Operators can confirm "what's
  actually running" without SSH.
- **Baked-in data + deploy triggers.** A service's deploy workflow `paths:`
  filter must cover **everything its image `COPY`s**, not just its code. The
  orchestrator image bakes in `templates/` (DockerSandbox seeds from
  `/app/templates`, ADR-0014) and its workspace deps (`packages/sandbox`,
  `acp-host`, `db`) — all must be in `deploy-orchestrator.yml` `paths:`, or a
  template/dep-only change builds & passes CI but never redeploys (STORY-14
  shipped a template that didn't reach prod → empty workspace).
- **First push to a new package**: GHCR returns **403** on the
  *second* push from CI if the package isn't linked to the repo. Two
  options:
  1. **Pre-push from the VPS** (no auth dance) so the package
     auto-creates linked to your user. Then CI can write.
  2. After the CI's first push (which usually succeeds anonymously),
     visit
     `https://github.com/users/<you>/packages/container/<name>/settings`
     and link the package to the repo + set visibility public.
- **Visibility:** make the production image public so the VPS pull
  doesn't need GHCR auth. Same package settings page.

## Deploy-readiness — failures CI can't see

CI builds in the full monorepo and runs in-process; several failure modes
only appear in the deployed container. `node scripts/deploy-readiness-check.mjs`
exists to catch them (scripted layer runs in CI; the full run adds an LLM
pass over the branch diff). The recurring ones, learned the hard way in
STORY-07:

- **Missing workspace COPY (happened twice).** A deployable gained a
  `@praxis/*` dependency but its `Dockerfile` didn't COPY the package, so the
  image built green in CI yet crash-looped at runtime
  (`ENOENT … node_modules/@praxis/sandbox`). **Fix:** COPY the package's
  `package.json` into the deps layer and its directory into the build layer —
  mirror how `packages/db` is handled. The scripted readiness check enforces
  this; it would have caught both incidents.
- **No-build services have no compile net.** The orchestrator runs Bun (TS
  natively; `build` is a no-op `echo`), so a missing dependency or bad import
  surfaces only when the container starts. Always **boot the image with
  prod-like env** (`--env-file`, `--network praxis-net`, the same mounts) and
  read the logs before calling an infra story done.
- **Host-resource access needs more than a mount.** Mounting
  `/var/run/docker.sock` is necessary but not sufficient: the container runs as
  non-root `bun` (gid 1000) and the socket is `root:docker` (mode `0660`), so
  dockerode failed with a vague "typo in the url or port?" until the unit added
  **`--group-add <docker-gid>`** (the host `docker` gid, `getent group docker` —
  988 on this VPS; host-specific). The same applies to published ports,
  volumes, and capabilities — verify access from *inside* the container.
- **Verify on a real cycle, not a smoke test.** Behaviour on a timer (e.g. the
  idle sweep first fires 60s after boot) is invisible to a 4-second check — that
  reads as a false "all clear". Boot the image and wait a full cycle, then
  assert the real signal (e.g. zero `sandbox.sweep_failed` after a sweep runs).
- **`.service` changes need a manual VPS re-apply.** The deploy workflow does
  `docker pull` + `systemctl restart`, but does **not** copy the unit file. Any
  change to mounts / `--group-add` / ports in `infrastructure/deploy/*.service`
  requires, on the VPS: `sudo cp … /etc/systemd/system/ && sudo systemctl
  daemon-reload && sudo systemctl restart <svc>`. List it under Operator
  follow-ups.

## CI deploy workflow shape

Every service has a `deploy-<service>.yml` mirroring this shape (two
jobs since ADR-0011):

1. `on: push: branches: [main]` with `paths:` filters scoped to the
   service's workspace + its `infrastructure/deploy/<unit>.service`
   + the workflow file itself.
2. `concurrency: deploy-<service>` (per-workflow, **not** shared across
   services — a shared group cancels legitimate concurrent deploys; see
   #142) so two merges in quick succession queue rather than race.
3. **`build` job** on `ubuntu-latest`: `docker/build-push-action@v6`,
   context `.`, `build-args: GIT_SHA=${{ github.sha }}`, GHA cache,
   pushes to GHCR.
4. **`deploy` job** (`needs: build`) on the **self-hosted runner**
   (`runs-on: [self-hosted, praxis-vps]`): runs `sudo systemctl restart
   praxis-<service>.service` **locally** — no SSH. The runner lives on
   the VPS, so the deploy hop has no internet path to flake on (ADR-0011
   replaced the SSH-action push, which timed out intermittently from
   GitHub-hosted runner IPs). GitHub still reports job success/failure,
   so notifications stay native.
5. **Smoke test** (inline curl-retry against the public `/health` URL)
   so a failed deploy turns the job red.

The `paths:` filter is load-bearing — without it, every `docs/`
commit redeploys every service. The self-hosted runner runs one job at
a time, so deploy jobs serialize on it naturally.

## What the operator does (every new service)

These steps can't be done from CI. List them in the PR's "operator
follow-ups" section so they aren't missed.

1. **DNS** — `A` record for `<sub>.<domain>` → VPS IP.
2. **GHCR package settings** — link to repo, flip to public (one-off
   per package).
3. **GH Actions variable** — any per-service `<SERVICE>_DOMAIN` var
   the workflow references.
4. **`/etc/praxis/praxis.env`** — add new env vars; reload affected
   services (`systemctl restart praxis-<service>`).
5. **Caddy block** — paste from `infrastructure/caddy/Caddyfile`,
   validate, reload.
6. **systemd unit** — `cp` from `infrastructure/deploy/`,
   `daemon-reload`, `enable --now`.
7. **Sudoers** — append the restart grant, `visudo -c`.

The runbook at `docs/runbooks/deploy-<service>.md` records these
**once they're done** as "Setup history (one-time)" so a future
VPS rebuild is reproducible.

## Disk hygiene (image buildup + orphan sandboxes)

Each deploy builds + pushes a fresh `praxis-orchestrator`/`praxis-web` image,
leaving the prior one dangling; many deploys can fill `/` to 100%, at which point
the orchestrator's systemd restart fails and the API goes 503 (CI/merge stay
green — it's a host-disk issue, not code). Project **sandboxes** don't add to
this (all share the one `praxis-sandbox-base` image, one reused container +
volume per project), but a `praxis-project-<id>` volume / `praxis-sandbox-<id>`
container is **orphaned** if its project was deleted without a clean
`DockerSandbox.destroy`.

`infrastructure/deploy/praxis-hygiene.sh` (run daily by `praxis-hygiene.timer`)
handles both, idempotently and safely:

- `docker image prune -f` (dangling) + `docker builder prune --keep-storage 10g`
  + remove all but the newest `KEEP_SHA` (3) `sha-*` tags per platform repo —
  `:latest` and the shared sandbox base are never touched.
- Reap `praxis-sandbox-<id>` containers + `praxis-project-<id>` volumes whose
  `<id>` is **not** a current row in `projects`. The valid-id list comes from the
  DB; **if that query fails the reap is skipped** (never delete sandboxes on a
  transient DB error). `DRY_RUN=1` previews without removing.

Recover a full disk by hand with the same script (or `docker builder prune -af`
+ `docker image prune -f`), then `sudo systemctl restart praxis-orchestrator`.

**Operator follow-up:** copy `praxis-hygiene.{service,timer}` to
`/etc/systemd/system/`, ensure the script is executable at
`/opt/praxis/infrastructure/deploy/praxis-hygiene.sh`, `daemon-reload`, then
`systemctl enable --now praxis-hygiene.timer`.
