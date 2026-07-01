# Deploy: Praxis Postgres on the VPS

Postgres 16 in a Docker container managed by systemd, with a daily
`pg_dump` backup via a sibling timer. Mirrors `praxis-web.service`'s
shape (see `deploy-web.md`).

This is **infrastructure** for STORY-03+. Migrations themselves run
from the orchestrator (STORY-05) on startup — see TASK-015 prereqs
for where `pnpm db:migrate` will be invoked in production.

## Topology

```
                  apps/web, services/orchestrator
                            │
                            ▼
                  ┌──────────────────────┐
                  │ praxis-postgres.svc  │   systemd, Type=simple
                  │ docker run --rm      │
                  │ 127.0.0.1:5432:5432  │
                  │ vol praxis_pg_data   │
                  └──────────────────────┘
                            │
                            ▼ (daily at 03:30 UTC)
                  ┌──────────────────────┐
                  │ praxis-postgres-     │   timer + oneshot
                  │   backup.{service,   │
                  │   timer}             │
                  │ /var/backups/praxis/ │
                  │ 14-day retention     │
                  └──────────────────────┘
```

## Daily operations

### Status

```bash
sudo systemctl status praxis-postgres.service
sudo systemctl list-timers praxis-postgres-backup.timer
docker ps --filter name=praxis-db
docker exec -t praxis-db pg_isready -U praxis -d praxis
```

### Tail logs

```bash
journalctl -u praxis-postgres.service -f       # systemd-level
docker logs -f praxis-db                       # postgres stdout / errors
```

### Manual backup

```bash
sudo systemctl start praxis-postgres-backup.service
ls -la /var/backups/praxis/
```

### Restore from a backup

```bash
# Stop the orchestrator first (live writes would race the restore).
sudo systemctl stop praxis-orchestrator.service   # added in STORY-05

# Drop + recreate the DB, then load.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" praxis-db \
  psql -U praxis -d postgres -c 'DROP DATABASE IF EXISTS praxis;'
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" praxis-db \
  psql -U praxis -d postgres -c 'CREATE DATABASE praxis;'
gunzip -c /var/backups/praxis/praxis-2026-05-31.sql.gz | \
  docker exec -i praxis-db psql -U praxis -d praxis

sudo systemctl start praxis-orchestrator.service
```

### Restart Postgres

```bash
sudo systemctl restart praxis-postgres.service
```

NOTE: this terminates open connections; the orchestrator should reconnect on its next request. Brief writes-in-flight may need application-level retry — design assumption baked into ADR-0001 and the autodev pipeline.

## Setup history (one-time work)

### What was added during STORY-03

1. **Container + volume:** `postgres:16-alpine` (matches Colonize's image — version-aligned without coupling). Named volume `praxis_pg_data` under `/var/lib/docker/volumes/`.

2. **systemd unit** at `/etc/systemd/system/praxis-postgres.service` (mirrors `praxis-web.service` shape).

3. **Daily backup** at `/etc/systemd/system/praxis-postgres-backup.{service,timer}` runs `pg_dump | gzip` to `/var/backups/praxis/praxis-YYYY-MM-DD.sql.gz`. 14-day retention. Timer fires daily at 03:30 UTC.

4. **Sudoers extension** at `/etc/sudoers.d/praxis-deploy` adds the praxis-postgres restart grant:

   ```
   deploy ALL=(root) NOPASSWD: \
     /bin/systemctl restart praxis-web.service, \
     /bin/systemctl reload caddy.service, \
     /bin/systemctl restart praxis-postgres.service
   ```

5. **Env file** at `/etc/praxis/praxis-postgres.env` (NOT in the repo) populated with a strong `POSTGRES_PASSWORD`. Generate via:

   ```bash
   openssl rand -base64 32
   ```

### Install steps (re-run on a fresh VPS)

```bash
# 1. Populate env (interactive — choose a strong password)
sudo install -d -m 0750 /etc/praxis
sudo cp infrastructure/deploy/praxis-postgres.env.example /etc/praxis/praxis-postgres.env
sudo nano /etc/praxis/praxis-postgres.env       # set POSTGRES_PASSWORD

# 2. Create the shared Docker network (idempotent)
sudo docker network create praxis-net 2>/dev/null || true

# 3. Install units
sudo cp infrastructure/deploy/praxis-postgres.service /etc/systemd/system/
sudo cp infrastructure/deploy/praxis-postgres-backup.service /etc/systemd/system/
sudo cp infrastructure/deploy/praxis-postgres-backup.timer /etc/systemd/system/

# 4. Extend sudoers (see "What was added" → "Sudoers extension" above).
sudo visudo -f /etc/sudoers.d/praxis-deploy

# 5. Reload + enable
sudo systemctl daemon-reload
sudo systemctl enable --now praxis-postgres.service
sudo systemctl enable --now praxis-postgres-backup.timer

# 6. Smoke test
docker exec -t praxis-db pg_isready -U praxis -d praxis
docker exec -t praxis-db psql -U praxis -d praxis -c '\dt'   # empty, no error
```

## DATABASE_URL convention

Sibling env file `/etc/praxis/praxis.env` (also NOT committed) carries:

```bash
DATABASE_URL=postgres://praxis:<password>@praxis-db:5432/praxis
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=https://praxis.blacksail.dev
RESEND_API_KEY=<from resend.com>
RESEND_FROM=noreply@praxis.blacksail.dev
```

Consumed by `praxis-web.service` (and later the orchestrator) via
`--env-file /etc/praxis/praxis.env`. `praxis-postgres.env` only
carries Postgres-internal settings (user/db/password); the URL form
lives separately so app-level env can grow independently.

### Two conventions worth knowing about `praxis.env`

1. **`praxis-db` is the hostname, not `127.0.0.1`.** Containers on the
   shared `praxis-net` Docker network resolve each other by container
   name (built-in DNS). `127.0.0.1` from inside a container is the
   container itself, not the host, so it can't reach Postgres' host-side
   port binding. Hence the `praxis-db` hostname.
2. **The file must be ASCII-only with no inline comments.** Docker's
   `--env-file` parser silently stops reading after some non-ASCII
   characters (em-dashes, smart quotes), so a stray "—" in a comment
   line drops every subsequent variable from the container's env.
   Keep `/etc/praxis/praxis.env` strictly `KEY=VALUE` lines.

## Local dev

```bash
docker compose -f infrastructure/deploy/docker-compose.dev.yml up -d postgres
docker exec -t praxis-db-dev pg_isready -U praxis -d praxis
DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5432/praxis pnpm db:migrate
```

Container name `praxis-db-dev` (vs `praxis-db` on the VPS) so a dev
running on the production host doesn't collide with the real DB.
