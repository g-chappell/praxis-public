# @praxis/orchestrator

The Bun + Hono process at the centre of the Praxis platform — WebSocket
hub, prompt queue, ACP host driver, sandbox lifecycle. STORY-05 lands
the skeleton; later stories build on top.

## Local dev

### Option A — install Bun on your machine (recommended)

```bash
curl -fsSL https://bun.sh/install | bash
# Restart your shell so bun is on PATH.

# From the repo root:
docker compose -f infrastructure/deploy/docker-compose.dev.yml up -d postgres
DATABASE_URL=postgres://praxis:praxis@127.0.0.1:5432/praxis \
PORT=4001 \
bun --filter @praxis/orchestrator run dev
```

`/health` lands at <http://localhost:4001/health>.

### Option B — Docker only

```bash
docker build -t praxis-orchestrator -f services/orchestrator/Dockerfile .
docker run --rm -p 4001:4001 \
  -e DATABASE_URL=postgres://praxis:praxis@host.docker.internal:5432/praxis \
  --add-host host.docker.internal:host-gateway \
  praxis-orchestrator
```

## Production

- Runs as `praxis-orchestrator.service` on the VPS (systemd, `--network
  praxis-net`, `--env-file /etc/praxis/praxis.env`).
- Fronted by Caddy at `api.praxis.blacksail.dev`.
- Deploys via `.github/workflows/deploy-orchestrator.yml` on push to
  main when `services/orchestrator/**` changes.

See `docs/runbooks/deploy-orchestrator.md` for ops procedures.

## Stack

- Bun 1.1
- Hono 4.6.x (pinned exactly — WS API moves between minor versions)
- pino for structured logging
- `@praxis/db` workspace for the Postgres client

## Conventions

See `AGENTS.md` in this directory for orchestrator-specific code
patterns (Hono routes, WS message contract, log schema).
