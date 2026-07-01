# syntax=docker/dockerfile:1.7
#
# Praxis web — multi-stage build producing a slim Node 20 Alpine image
# running Next.js's standalone server on port 3000.
#
# Build context MUST be the repo root so this Dockerfile can see the root
# pnpm-lock.yaml and pnpm-workspace.yaml. Build with:
#
#   docker build -t praxis-web -f apps/web/Dockerfile .

# ---------- deps ----------
# Install workspace dependencies. Filtering with --filter @praxis/web...
# prunes everything not transitively needed by the web workspace, so the
# layer stays small.
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
# apps/web depends on @praxis/db and @praxis/crypto (workspace:*) — copy
# their manifests so pnpm install can wire the workspace symlinks. The
# actual source ships in the builder stage below.
COPY packages/db/package.json packages/db/package.json
COPY packages/crypto/package.json packages/crypto/package.json
# @praxis/keys (workspace:*) — platform-key service used by the admin UI.
COPY packages/keys/package.json packages/keys/package.json

RUN pnpm install --frozen-lockfile --filter @praxis/web...

# ---------- builder ----------
# Build with the same node_modules layout as deps. Next.js standalone
# output lives at apps/web/.next/standalone/.
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.5 --activate

COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
# Bring @praxis/db's and @praxis/crypto's source in too so Next.js's
# webpack can resolve `@praxis/db`, `@praxis/db/client`, and
# `@praxis/crypto` at build time.
COPY packages/db ./packages/db
COPY packages/crypto ./packages/crypto
COPY packages/keys ./packages/keys

RUN pnpm --filter @praxis/web build

# ---------- runner ----------
# Slim runtime: just node + the standalone bundle + static + (optional) public.
# Run as a non-root user (the `node` user ships with the base image).
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next.js standalone places a minimal node_modules + a server.js entrypoint
# under apps/web/. .next/static and public are NOT included — copy them
# explicitly into the layout server.js expects.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# Public is optional; the COPY tolerates the directory not existing.
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
