#!/usr/bin/env bash
# finalize-task.sh — extract /autonomous-run Step 9 (roadmap done-marking
# before enabling auto-merge) into a deterministic script. Flips roadmap
# status → done, stamps pr + completed, re-renders, commits and pushes.
#
# Usage:   scripts/finalize-task.sh <TASK-ID> <PR-URL> [--story-verified]
#
# With --story-verified: ALSO stamp the parent Story's feature_complete=
# verified and verified_at=<iso>. Called by /autonomous-run Step 8.5
# when the Story-closing terminal task's acceptance check passed.
#
# Stdout:  the commit SHA of the roadmap commit
# Exit:    0 on success, 1 if task id missing, 2 on setup errors

set -euo pipefail

TASK_ID="${1:-}"
PR_URL="${2:-}"
STORY_VERIFIED="false"
shift || true
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --story-verified) STORY_VERIFIED="true" ;;
    *) echo "finalize-task: unknown arg '$1'" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$TASK_ID" || -z "$PR_URL" ]]; then
  echo "usage: $0 <TASK-ID> <PR-URL> [--story-verified]" >&2
  exit 2
fi

if [[ ! "$PR_URL" =~ ^https?://[^[:space:]]+/pull/[0-9]+ ]]; then
  echo "finalize-task: PR URL must look like https://.../pull/<num>, got '$PR_URL'" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Must be on a non-main branch (the feature branch owning this task).
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" == "main" || "$BRANCH" == "master" || -z "$BRANCH" ]]; then
  echo "finalize-task: refusing to run on '$BRANCH' — switch to the feature branch" >&2
  exit 2
fi

node "$ROOT/scripts/roadmap-update-task.mjs" "$TASK_ID" \
  --status done \
  --pr "$PR_URL" \
  --completed-now || {
    echo "finalize-task: $TASK_ID not found in roadmap" >&2
    exit 1
  }

if [[ "$STORY_VERIFIED" == "true" ]]; then
  node "$ROOT/scripts/update-story-feature-complete.mjs" "$TASK_ID" verified || {
    echo "finalize-task: failed to stamp Story feature_complete for $TASK_ID" >&2
    # Don't fail the whole script — task is still done, just story
    # verification stamp didn't take. Surfaces in next-cycle audit.
  }
fi

node "$ROOT/roadmap/render.mjs"

# Extract PR number from URL for the commit subject.
PR_NUM="${PR_URL##*/pull/}"
PR_NUM="${PR_NUM%%[![:digit:]]*}"

COMMIT_MSG="roadmap: mark $TASK_ID done (PR #$PR_NUM)"
if [[ "$STORY_VERIFIED" == "true" ]]; then
  COMMIT_MSG="$COMMIT_MSG, story verified"
fi

git add roadmap/roadmap.yml ROADMAP.md
git commit -m "$COMMIT_MSG" >/dev/null
git push origin "$BRANCH" >/dev/null

git rev-parse HEAD
