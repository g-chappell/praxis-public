#!/usr/bin/env bash
# deploy.sh — build + up -d + health-check + auto-rollback on fail
#
# Reads .claude/project.json for deploy settings. Invoked by /deploy skill
# or directly by operators.
#
# Exit codes:
#   0  success, healthy
#   1  build failed
#   2  container start failed
#   3  health check failed AND rollback failed (critical)
#   4  health check failed, rollback succeeded (app on previous image)
#   5  prisma migrate deploy failed (db unchanged, previous image still serving)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# --- Read project.json with node (no jq dependency) ---
read_config() {
  node -e "
    const p = require('$PROJECT_ROOT/.claude/project.json');
    console.log(p.deploy?.$1 ?? '');
  " 2>/dev/null || echo ""
}

HEALTH_URL=$(read_config healthCheckUrl)
TIMEOUT=$(read_config healthCheckTimeoutSec)
ROLLBACK_ON_FAIL=$(read_config rollbackOnFail)
STRATEGY=$(read_config strategy)
SLUG=$(node -e "console.log(require('$PROJECT_ROOT/.claude/project.json').project?.slug ?? 'app')" 2>/dev/null || echo "app")

HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
TIMEOUT="${TIMEOUT:-90}"
STRATEGY="${STRATEGY:-rolling}"

COMPOSE="docker compose -f docker/docker-compose.yml"

# --- Record previous image tag for rollback ---
if docker image inspect "${SLUG}:latest" >/dev/null 2>&1; then
  PREV_ID=$(docker image inspect "${SLUG}:latest" --format '{{.Id}}')
  echo "$PREV_ID" > "$SCRIPT_DIR/.previous-image"
  docker tag "${SLUG}:latest" "${SLUG}:previous" || true
fi

# --- Pre-flight: prune Docker artifacts when disk is tight ---
# Multi-stage builder layers + per-deploy build cache accumulate fast on a
# long-lived host. When the root partition fills, `npm ci` (or any builder
# install step) fails with ENOSPC and the build aborts before any image is
# produced. Auto-prune unused images + build cache when free space drops
# below 5 GiB. Tagged images (${SLUG}:latest, ${SLUG}:previous, the
# rollback target) are preserved by `docker image prune -a` since it
# removes only untagged and unreferenced images. Best-effort: never abort
# deploy on a prune failure. Runs AFTER the rollback-tagging block so
# :previous is already pinned before pruning runs.
AVAIL_KB=$(df -P / | awk 'NR==2 {print $4}')
AVAIL_GB=$(( AVAIL_KB / 1024 / 1024 ))
if [[ "$AVAIL_GB" -lt 5 ]]; then
  echo "==> Disk free under 5 GiB (${AVAIL_GB} GiB) — pruning unused docker images + build cache"
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  echo "==> Disk free after prune: $(df -h / | awk 'NR==2 {print $4}')"
fi

# --- Build ---
echo "==> Building ${SLUG}:latest"
$COMPOSE build --no-cache app || { echo "build failed" >&2; exit 1; }

# --- Detect Prisma schema (used by both strategies below) ---
# Looks in project root + workspace conventional locations. Projects without
# Prisma leave PRISMA_SCHEMA empty and the migration step is skipped.
PRISMA_SCHEMA=""
for candidate in prisma/schema.prisma apps/*/prisma/schema.prisma packages/*/prisma/schema.prisma; do
  if [[ -f "$candidate" ]]; then
    PRISMA_SCHEMA="$candidate"
    break
  fi
done

# --- Start / reload ---
echo "==> Deploying (strategy: $STRATEGY)"
if [[ "$STRATEGY" == "restart" ]]; then
  if [[ -n "$PRISMA_SCHEMA" ]]; then
    echo "==> WARNING: Prisma schema detected ($PRISMA_SCHEMA) but strategy is 'restart' — automatic migrations are not run. Use 'rolling' strategy, or migrate from your app entrypoint." >&2
  fi
  $COMPOSE down
  $COMPOSE up -d
else
  # rolling strategy: ensure dependent services (db, redis, mailcatcher, …)
  # are running first, then force-recreate just the app container. The
  # `up -d --no-recreate` pass starts any missing services without touching
  # already-healthy ones; the second pass swaps the app with minimal gap.
  # Without the first pass, a freshly-introduced compose service (e.g. a
  # postgres `db` added in a later task) is never started and the rolling
  # app recreate fails its healthcheck because its dependencies don't exist.
  $COMPOSE up -d --no-recreate

  # Apply Prisma migrations between deps-up and app-recreate. Failure here
  # exits before swap, so the previous app keeps serving the previous
  # schema (safe rollback semantics). For this to work the project's
  # docker-compose.yml should declare `app.depends_on.<db>: condition:
  # service_healthy` so `compose run` waits for the db to be ready.
  if [[ -n "$PRISMA_SCHEMA" ]]; then
    echo "==> Applying Prisma migrations ($PRISMA_SCHEMA)"
    if ! $COMPOSE run --rm app npx prisma migrate deploy; then
      echo "==> Prisma migrate FAILED — previous image still serving, no swap performed" >&2
      exit 5
    fi
  fi

  $COMPOSE up -d --no-deps --force-recreate app
fi

# --- Health check ---
echo "==> Health check: $HEALTH_URL (timeout ${TIMEOUT}s)"
if bash "$SCRIPT_DIR/healthcheck.sh" "$HEALTH_URL" "$TIMEOUT"; then
  echo "==> Deploy successful"
  # tag old image as n-1 for quick rollback if future deploy fails
  rm -f "$SCRIPT_DIR/.previous-image"
  exit 0
fi

# --- Health failed: rollback? ---
echo "==> Health check FAILED"
if [[ "$ROLLBACK_ON_FAIL" != "true" ]]; then
  echo "==> Rollback disabled; leaving failed deploy in place" >&2
  exit 4
fi

echo "==> Rolling back..."
if bash "$SCRIPT_DIR/rollback.sh"; then
  echo "==> Rollback successful; previous image restored"
  exit 4
else
  echo "==> Rollback FAILED — app may be in a broken state" >&2
  exit 3
fi
