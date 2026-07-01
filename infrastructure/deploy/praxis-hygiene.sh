#!/usr/bin/env bash
# praxis-hygiene.sh — VPS disk hygiene. Two jobs, both safe + idempotent:
#
#   1. Reclaim Docker disk left by platform-image rebuilds (orchestrator/web):
#      dangling images, bounded build cache, and old sha-* tags (keep the most
#      recent few for rollback). The shared sandbox base image and :latest are
#      never touched.
#   2. Reap orphaned project sandboxes — a `praxis-sandbox-<id>` container or
#      `praxis-project-<id>` volume whose project no longer exists in the DB.
#      `DockerSandbox.destroy` already cleans these on project delete; this catches
#      failed destroys / pre-STORY-13 leftovers.
#
# Run daily via praxis-hygiene.timer, or by hand. Set DRY_RUN=1 to only list what
# would be removed. Designed to run as root (systemd) with Docker access.
#
# Env overrides: DB_CONTAINER (default praxis-db), KEEP_SHA (default 3),
#                CACHE_KEEP (default 10g), DRY_RUN (default 0).
set -uo pipefail

DB_CONTAINER="${DB_CONTAINER:-praxis-db}"
KEEP_SHA="${KEEP_SHA:-3}"
CACHE_KEEP="${CACHE_KEEP:-10g}"
DRY_RUN="${DRY_RUN:-0}"
REPOS=(ghcr.io/g-chappell/praxis-orchestrator ghcr.io/g-chappell/praxis-web)

log() { echo "[praxis-hygiene] $*"; }
run() {
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY-RUN would: $*"
  else
    "$@" >/dev/null 2>&1 || log "warn: failed: $*"
  fi
}

# ── 1. platform images + build cache ──────────────────────────────────
log "pruning dangling images"
[ "$DRY_RUN" = "1" ] && log "DRY-RUN skip: docker image prune -f" || docker image prune -f >/dev/null || true
log "pruning build cache (keep ${CACHE_KEEP})"
[ "$DRY_RUN" = "1" ] && log "DRY-RUN skip: docker builder prune -f --keep-storage ${CACHE_KEEP}" \
  || docker builder prune -f --keep-storage "${CACHE_KEEP}" >/dev/null || true

# Keep the KEEP_SHA most-recent sha-* tags per platform repo (for rollback);
# remove older ones by tag so :latest (a separate tag on the same id) is unaffected.
for repo in "${REPOS[@]}"; do
  docker images --filter "reference=${repo}:sha-*" --format '{{.CreatedAt}}|{{.Repository}}:{{.Tag}}' \
    | sort -r | awk -F'|' -v k="${KEEP_SHA}" 'NR>k {print $2}' \
    | while IFS= read -r img; do
        [ -n "$img" ] || continue
        log "old sha image: $img"
        run docker rmi "$img"
      done
done

# ── 2. orphaned project sandboxes ─────────────────────────────────────
# Valid project ids straight from the DB. If the query fails we ABORT the reap —
# never delete sandboxes on a transient DB error (that could wipe live projects).
if ! valid_raw=$(docker exec "${DB_CONTAINER}" psql -U praxis -d praxis -tAc 'SELECT id FROM projects;' 2>/dev/null); then
  log "warn: could not query ${DB_CONTAINER} for projects — skipping sandbox reap"
  exit 0
fi
declare -A VALID=()
while IFS= read -r id; do [ -n "$id" ] && VALID["$id"]=1; done <<<"$valid_raw"
log "found ${#VALID[@]} live project(s)"

# Orphan sandbox containers: praxis-sandbox-<projectId>
while IFS= read -r name; do
  [ -n "$name" ] || continue
  id="${name#praxis-sandbox-}"
  if [ -z "${VALID[$id]:-}" ]; then
    log "orphan container: $name (project $id gone)"
    run docker rm -f "$name"
  fi
done < <(docker ps -a --filter 'name=praxis-sandbox-' --format '{{.Names}}')

# Orphan sandbox volumes: praxis-project-<projectId>
while IFS= read -r vol; do
  [ -n "$vol" ] || continue
  id="${vol#praxis-project-}"
  if [ -z "${VALID[$id]:-}" ]; then
    log "orphan volume: $vol (project $id gone)"
    run docker volume rm "$vol"
  fi
done < <(docker volume ls --filter 'name=praxis-project-' --format '{{.Name}}')

log "done"
