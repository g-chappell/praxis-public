# 0004 — VPS is multi-tenant; Caddy replaces existing nginx

**Date:** 2026-05-31
**Status:** Accepted
**Supersedes (in part):** ADR-0001

## Context

ADR-0001 specified that the POC deploys entirely to a single VPS via
Caddy + Docker. That ADR was written without inspecting the actual VPS
state.

Pre-flight check during STORY-02 TASK-008 prereq setup revealed:

- **The VPS already runs three pre-existing tenant apps** under
  `*.blacksail.dev`, occupying host ports `:3000`, `:3001`, and `:4000`.
- **nginx was the reverse-proxy + TLS terminator**, with all three
  certs issued and auto-renewed by **certbot** via its nginx plugin.
- Caddy was installed but failed to start because nginx held `:80`/`:443`.
- The original Praxis plan to use `127.0.0.1:3000` would have collided
  with one of the pre-existing tenants.

ADR-0001's deploy topology was still right (single VPS, Caddy +
Docker), but the assumption of a clean host was wrong, and three
decisions had to be made on the fly:

1. **Reverse proxy:** keep nginx (add Praxis as a new site) or migrate
   the whole VPS to Caddy?
2. **TLS:** keep certbot or have Caddy take over ACME?
3. **Port:** what's the next free port for `praxis-web`?

## Decision

**Migrate the whole VPS reverse proxy from nginx to Caddy.** Caddy
serves all four apps (Praxis + the three pre-existing tenants) and
manages all TLS via its built-in ACME client. certbot is retired.

`praxis-web` runs its container on host port **`:3002`** (next free
after the pre-existing tenants on `:3000` and `:3001`); the
container's internal port stays `:3000` (Next.js default).

### Implementation

- Host Caddyfile at `/etc/caddy/Caddyfile` was populated with one block
  per app. The Praxis-owned source-of-truth is
  `infrastructure/caddy/Caddyfile` in this repo, which documents the
  Praxis block; the other three blocks live in their respective repos
  and are mirrored into the host file by hand. (A future improvement
  would split the host file into `import /etc/caddy/conf.d/*.caddy`
  so each repo owns its own file; out of scope for STORY-02.)
- Caddy ACME issued fresh certs for all three existing apps
  (zero-downtime: existing certbot certs continued to serve until
  Caddy's issuance completed). The `praxis.blacksail.dev` cert will
  issue once DNS resolves.
- certbot was disabled (`systemctl disable --now certbot.timer`;
  `/etc/cron.d/certbot` commented out). The renewal configs at
  `/etc/letsencrypt/renewal/*.conf` are now dormant — kept on disk
  for the audit trail, harmless.
- POSIX ACLs grant the `caddy` system user read access to
  `/etc/letsencrypt/{live,archive}/` for the brief window when Caddy
  was using the existing certs.

## Consequences

- **Easier:** one TLS strategy across four apps (Caddy ACME, no
  certbot drift). One configuration surface (`/etc/caddy/Caddyfile`).
  Caddy's wildcard / on-demand-TLS features are now available for
  STORY-13 (`*.preview.<domain>` sandbox URLs) without a tooling
  change.
- **Harder:** the host Caddyfile mixes ownership across four repos.
  Until we split it via `import`, edits to any one app's block
  require root access and aren't tracked in that repo's git history
  (only in the host filesystem). We've accepted this as a POC
  trade-off; the multi-repo import structure is a clean follow-up.
- **Now true:**
  - **All TLS goes through Caddy ACME.** certbot is dead weight; the
    cron + timer are disabled but `/etc/letsencrypt/` remains on disk.
  - **Port `:3002` is Praxis's host port.** Subsequent stories
    (orchestrator at `api.blacksail.dev`, MinIO, etc.) should pick
    `:4001+` to avoid the pre-existing tenant on `:4000`.
  - **The `caddy` system user has read access to `/etc/letsencrypt/`
    via ACL.** Once certbot is fully removed, this can be revoked.
- **Reversibility:** to go back to nginx for any app, restart its
  nginx site (configs are preserved at `/etc/nginx/sites-available/`)
  and remove that app's block from `/etc/caddy/Caddyfile`. The old
  certbot certs are still on disk; nginx will pick them up. ~5
  minutes per app.

## Alternatives considered

- **Add Praxis to nginx instead of migrating.** Materially simpler
  (5 minutes, zero risk to other apps), and was my initial
  recommendation when this surfaced. Rejected because (a) we were
  going to need Caddy eventually for STORY-13's wildcard preview
  URLs, (b) certbot + nginx was already two tools managing TLS
  semi-independently, (c) two reverse proxies in flight (one
  configured here, one configured per-app-repo) felt worse than
  paying the migration cost once. Still a sound fallback if Caddy
  causes pain later.
- **Deploy Praxis to a separate VPS.** Cleanest blast-radius
  separation. Rejected on cost grounds (POC is meant to run on the
  existing host) and because the autonomous-dev cycle is also on
  this VPS — splitting Praxis off would mean two hosts to maintain.
- **Keep certbot, add a webroot authenticator.** Possible — Caddy
  serves the ACME challenge, certbot renews to its own paths, Caddy
  reloads via deploy_hook. More moving parts; no upside over Caddy
  ACME. Rejected.

Supersedes (in part) ADR-0001: the *deploy via Caddy + Docker on a
single VPS* decision stands. The *fresh-host assumption* and the
*Caddy-only-for-Praxis* implicit framing do not.
