# 0001 — POC deploys entirely to a single VPS via Caddy + Docker

**Date:** 2026-05-31
**Status:** Accepted

## Context

The Executive Summary and Project Plan (`docs/executive_summary.md`, `docs/project_plan.md` §2 / §6) originally specified a split deploy: Next.js frontend on **Cloudflare Pages**, orchestrator (Bun + Hono) on a VPS, per-project Docker sandboxes on the same VPS, Postgres alongside, and Caddy as a reverse proxy in front of the orchestrator + sandbox preview URLs.

During STORY-01 we revisited the split. Constraints relevant to the POC phase:

- **One-month POC budget**, two part-time contributors. Every external integration costs setup, monitoring, and recovery time we'd rather not spend on deploys.
- **Test users are universities pairing on game-shaped projects**; latency or CDN geography is not a load-bearing user concern.
- **Cloudflare Pages adds:** a separate deploy pipeline (GitHub Pages action or wrangler), a separate origin for the orchestrator (CORS + cookie domain coordination), separate observability, separate TLS, and a separate place to track failures. None of these add product value at POC scale.
- **A single VPS already runs Docker, will run the orchestrator + Postgres + per-project sandbox containers**, and is the host where Claude Code itself runs as a systemd service for the autonomous cycle.

## Decision

For the POC phase, **all Praxis components deploy to one VPS**:

- `apps/web` (Next.js) runs as a Docker container exposed via `app.<domain>`
- `services/orchestrator` (Bun + Hono) runs as a Docker container exposed via `api.<domain>` (HTTP + `/ws` WebSocket upgrade)
- Per-project sandboxes are Docker containers spawned on demand, exposed via `*.preview.<domain>` (Caddy wildcard with on-demand TLS)
- Postgres 16 runs as a Docker container on the same host with a persistent volume and daily `pg_dump` backups
- **Caddy** is the single reverse proxy / TLS terminator for all three hostnames

Cloudflare Pages is **deferred to post-POC** — when persistent preview URLs, global CDN, and edge functions matter at user scale.

## Consequences

- **Easier:** single deploy pipeline (`scripts/deploy.sh` + a single `systemctl reload`), single TLS terminator (Caddy with on-demand certs), single set of logs/metrics to monitor, no CORS or cookie-domain coordination across origins.
- **Harder:** the VPS is a single point of failure. Acceptable at POC scale (test users, no SLA); not acceptable for any paying customer. The cutover to a multi-host topology is a known cost we'll pay when we leave the POC.
- **Now true:** `infrastructure/caddy/Caddyfile` is the canonical hostname-routing source; adding a new hostname is a Caddyfile change, not a DNS-plus-Cloudflare ticket. `apps/web/Dockerfile` is a real Dockerfile (Next.js standalone output), not a Pages config.
- **Reversibility:** moving the frontend to Cloudflare Pages later is a discrete change (replace `apps/web/Dockerfile` deploy with `wrangler pages deploy`, point DNS at Pages, retire the `app.<domain>` Caddy block). The orchestrator's API surface doesn't change. Cost: one focused PR + one DNS coordination window.

This decision is implemented across **STORY-01** (where it's recorded), **STORY-02** (`apps/web` Dockerfile + Caddy + deploy job), and **STORY-05** (orchestrator Dockerfile + systemd unit). No code outside `infrastructure/` or `.github/workflows/deploy-*.yml` depends on which deploy target we picked.

## Alternatives considered

- **Cloudflare Pages frontend + VPS backend (original plan).** Rejected for POC: more moving parts, two TLS terminators, CORS coordination overhead. Re-evaluate post-POC.
- **Fly.io for everything.** Rejected: another paid dependency, less control over the Docker sandbox host (the sandbox layer's idle-shutdown and resource limits are tuned for a host we own).
- **Vercel for the frontend.** Same shape as Cloudflare Pages, with an additional vendor lock-in. Same rejection rationale.

Supersedes the deploy topology described in `docs/executive_summary.md` §"Tech stack" (frontend hosting row) and `docs/project_plan.md` §2 (the diagram showing `Cloudflare Pages`).
