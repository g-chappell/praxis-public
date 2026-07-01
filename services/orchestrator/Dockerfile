# syntax=docker/dockerfile:1.7
#
# Praxis orchestrator — single-stage Bun 1 Alpine image.
# Bun runs TypeScript natively so there is no separate build stage.
#
# Build context MUST be the repo root so this Dockerfile can see the
# root pnpm-lock.yaml + the @praxis/db workspace package. Build with:
#
#   docker build -t praxis-orchestrator -f services/orchestrator/Dockerfile .

FROM oven/bun:1.1-alpine
WORKDIR /app

# We use pnpm to manage the monorepo (Bun is the runtime only).
# Bun's image doesn't ship corepack, so install pnpm directly via npm.
# docker-cli: DockerSandbox exec/spawn shell out to `docker exec` (dockerode's
# hijacked exec stream doesn't work under Bun — see ADR-0010). The CLI talks to
# the mounted /var/run/docker.sock (the container already has the socket + gid).
RUN apk add --no-cache nodejs npm docker-cli \
    && npm install -g pnpm@9.15.5

# Build arg + env for the /health response. The deploy workflow passes
# ${{ github.sha }} so /health reports the exact commit serving traffic.
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA} \
    NODE_ENV=production \
    PORT=4001

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY services/orchestrator/package.json services/orchestrator/package.json
# services/orchestrator depends on @praxis/db (workspace:*) — copy its
# manifest so pnpm install can wire the workspace symlink. Same gotcha
# as apps/web's Dockerfile.
COPY packages/db/package.json packages/db/package.json
# @praxis/sandbox (workspace:*) — DockerSandbox + the idle sweep. Its manifest
# pulls in dockerode/minio/tar-stream during install.
COPY packages/sandbox/package.json packages/sandbox/package.json
# @praxis/acp-host (workspace:*) — drives the in-sandbox claude-agent-acp adapter.
# NB: the orchestrator does NOT depend on @praxis/keys/@praxis/crypto — libsodium's
# wasm doesn't load under Bun, so the web app (Node) decrypts the platform key and
# passes it over POST /sessions.
COPY packages/acp-host/package.json packages/acp-host/package.json

# engine-strict is on at repo root, but Alpine's Node lags newer transitive
# deps (e.g. @noble/hashes needs Node 20.19+). Bun is the actual runtime;
# pnpm here is just resolving deps. Skip the engine check for this layer.
RUN pnpm install --frozen-lockfile --config.engine-strict=false --filter @praxis/orchestrator...

COPY tsconfig.base.json ./
COPY services/orchestrator ./services/orchestrator
COPY packages/db ./packages/db
COPY packages/sandbox ./packages/sandbox
COPY packages/acp-host ./packages/acp-host
# Template sources shipped as data — DockerSandbox seeds a fresh /workspace from
# /app/templates/<templateId> (runtime.ts templatesDir). STORY-27.
COPY templates ./templates

USER bun
EXPOSE 4001

WORKDIR /app/services/orchestrator
CMD ["bun", "run", "src/index.ts"]
