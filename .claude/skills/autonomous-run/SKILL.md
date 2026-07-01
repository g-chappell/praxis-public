---
name: autonomous-run
description: THE scheduled entry point. Runs one autonomous dev cycle: sync main, recover any stuck CI, select next task, branch, implement, validate locally, open PR with auto-merge, log, notify via PushNotification. Every 12th-14th step handles optional VPS auto-deploy. Self-improvement reviews (every N successes) are PR-driven and do not pause execution.
user-invocable: true
disable-model-invocation: true
---

# /autonomous-run

One cycle of the autonomous dev loop. Designed to be safe to re-run.

This is a **14-step** procedure (plus Step 4b). Steps 12–14 only fire when
VPS auto-deploy is configured (`project.json.deploy.autoDeployOnMerge: true`).

There is **no approval gate**. Self-improvement refinements are proposed
and auto-merged via PRs (see `/autonomous-review`); a bad refinement is
revertible via `git revert` or `gh pr close`. Nothing pauses the hourly
cadence short of `systemctl stop claude-{{slug}}.timer`.

---

## Step 1 — LOAD CONFIG

Read `.claude/project.json`. Extract:
- `commands.{typecheck,test,lint,build,dev}`
- `workspaces[]`
- `branchPrefix`, `ghBin`, `successThreshold`
- `schedule`, `deploy`, `host`

All subsequent steps use these values — never hardcode paths.

## Step 2 — PRECHECKS

```bash
node roadmap/validate.mjs        # roadmap integrity
git fetch origin main --prune    # sync refs
git status --porcelain           # must be clean
```

If roadmap invalid, write AGENT-LOG `outcome: blocked, reason: roadmap_invalid`
and stop.

If working tree dirty, write `outcome: skipped, reason: dirty_tree` and stop.

## Step 3 — SYNC + CLEANUP

```bash
git checkout main
git pull origin main
git remote prune origin

# Delete local branches whose remote is gone
git branch --merged main | grep -E "^\s*${branchPrefix}TASK-" \
  | xargs -r git branch -d
```

## Step 4 — CI AUTO-RECOVERY

Delegate the 3-attempts-per-PR loop to `scripts/ci-fix-recover.mjs`:

```bash
node scripts/ci-fix-recover.mjs
```

The script lists open PRs with a failing `ci` check, spawns a scoped
Claude subprocess (allowlist: `Bash(npm *), Bash(git *), Bash(node *),
Edit, Read, Grep, Glob`) per PR with up to `--max-attempts 3`, and runs
local validation before pushing. Exit codes:

- `0` — zero failing PRs OR all recovered
- `1` — some PRs still failing (script emits JSON summary)
- `2` — infra error (gh CLI missing, claude CLI missing, project.json
  unreadable)

If exit=1: write AGENT-LOG `outcome: blocked, reason:
ci_auto_fix_failed`, include the JSON summary in the entry body, and stop
the run (don't pick a new task while one is stuck).

If exit=2: write AGENT-LOG `outcome: blocked, reason: infra` and stop.

## Step 4b — BABYSIT OPEN REVIEW PRS (unstick BEHIND main)

Branch protection on `main` typically has `required_status_checks.strict = true`,
so GitHub's auto-merge waits for the head branch to be up to date but does
**not** auto-update strict-protected branches. If another PR lands between
a review PR's creation and its CI completing, the review PR flips to
`mergeStateStatus: BEHIND` and stalls indefinitely. The
`/autonomous-review` skill's Step 10 only handles BEHIND once at creation
time — subsequent cycles need this babysitter to keep the review PR fresh.

Re-rebase any open `auto/review-*` PR that is BEHIND. Best-effort — never
abort the cycle on failure:

```bash
gh pr list --state open --json number,mergeStateStatus,headRefName \
  --jq '.[] | select(.headRefName | startswith("auto/review-"))
              | select(.mergeStateStatus=="BEHIND") | .number' \
  | while read pr; do
      echo "==> Review PR #$pr BEHIND main — updating branch"
      gh api --method PUT "repos/{owner}/{repo}/pulls/$pr/update-branch" || true
    done
```

CI re-runs on the updated branch and auto-merge fires when green. Do NOT
block waiting for the merge — the next cycle (or the same cycle's Step 15
check) will see it cleared.

## Step 5 — SELECT TASK

Delegate to `scripts/select-task.mjs` — the deterministic feature-first
picker. It walks `roadmap.yml`, queries open PRs via `gh`, and applies the
priority order (top → bottom):

1. **Follow-up backlog** — any eligible Task with `followup_of != null`
   (added by `roadmap-followup.mjs` in a prior cycle). These pick first
   regardless of Story or priority.
2. **Feature affinity** — prefer Tasks in the same Story as the most
   recent in-progress task, or (if none) the Story containing the most
   recent AGENT-LOG `success` entry.
3. **Starvation guard** — if a `high`-priority Story has zero done tasks
   AND the active Story is `med`/`low`, switch to the starved Story.
4. **Default order** — within candidates: priority desc, then numeric ID asc.

```bash
result=$(node scripts/select-task.mjs)
# result is JSON: {taskId, storyId, reason} or {noTask: true, reason}
```

Eligibility: `status=="ready"` AND all `depends_on` done AND
`attempt_count<3` AND no open PR with this TASK-id in its branch name.

**Capture `reason` into the cycle's AGENT-LOG entry (Step 10) as the
`Picker reason:` line** — auditing why a Task was picked lets you see
when the feature-first rules fire (especially `follow-up` and
`starvation-guard`, which are the corrective branches).

After picking, load the parent Story's context for Step 7:

```bash
TASK_ID=$(echo "$result" | jq -r .taskId)
STORY_ID=$(echo "$result" | jq -r .storyId)
PICKER_REASON=$(echo "$result" | jq -r .reason)
# (Steps 6+ use these; Step 7 also reads acceptance_criteria + user_flow
# + out_of_scope from the Story node directly via the parsed roadmap.)
```

Increment `attempt_count` on the selected task, set `last_attempted` to
current ISO timestamp. Commit this on the feature branch — see Step 6.

If `result.noTask`:
- Write AGENT-LOG `outcome: skipped, reason: no_ready_tasks`
- If fewer than 3 ready tasks in the roadmap, include a "roadmap running
  low — consider running `/pm-brainstorm`" hint
- **Cross-project mirror (autodev-mcp).** Same as Step 10's mirror block,
  but for skipped/blocked exits — without this, the dashboard's cycle
  history shows only successful cycles, hiding skipped/blocked cadence.
  Both calls are best-effort:
  1. `mcp__autodev-mcp__cycleMetrics.record` with `{projectSlug,
     startedAt, finishedAt, outcome:"skipped"}` (token + cost fields
     omitted — no Claude work happened past Step 5).
  2. `mcp__autodev-mcp__agentLog.recordEntry` with `{projectSlug,
     timestamp, outcome:"skipped", body}` where `body` is the AGENT-LOG
     bullet just written.
- Stop.

## Step 6 — BRANCH + CLAIM (branch-as-payload)

Delegate the mechanical part to `scripts/new-branch.sh`:

```bash
branch=$(scripts/new-branch.sh <TASK-ID>)
```

The script reads the task's title from roadmap, derives a slug,
`git checkout -b ${branchPrefix}<id>-<slug> main`, flips the task's
status to `in-progress`, bumps `attempt_count`, stamps
`last_attempted` with the current UTC ISO, re-renders ROADMAP.md, and
commits `roadmap: mark <id> in-progress`. The branch name is printed
on stdout for downstream steps.

Exit codes: `0` ok, `1` if task id missing from roadmap, `2` on setup
errors (missing project.json, slug derivation failed, branch exists).

**All status changes live on the feature branch. Never commit them to main.**

## Step 7 — IMPLEMENT

**Load the parent Story's context FIRST.** Step 5 emitted `storyId`; read
the Story's `acceptance_criteria`, `user_flow`, `out_of_scope`, and
`task_acceptance` (per-task subset) from `roadmap.yml` and treat them as
the actual specification. The task `description` is a starting point;
the Story's AC is what the agent must satisfy — see AGENTS.md Tier 1
("Implement to the Story, not the literal Task body" — added in PR 4 of
the feature-first rollout).

Follow AGENTS.md Tier 1 rules:
- One file at a time
- Typecheck + targeted tests between edits (the `post-edit.mjs` hook does this automatically)
- Read whole components before editing
- Write tests for new behavior

Task description drives the work. Consult:
- AGENTS.md Tier 2/3 (conventions, testing patterns)
- Relevant `techstack_*.md` memory files

### No-stub policy (anti-drift)

If during implementation you discover the task as written can't be
completed without producing a stub/placeholder/mock-data path (see the
Tier 1 stub definition), **do not ship the stub**. Two paths:

1. **Auto-add follow-up tasks** when you're confident about what's
   missing. Call:
   ```bash
   node scripts/roadmap-followup.mjs <TASK-ID> \
     --reason "<one-line why follow-up is needed>" \
     --add-tasks "<title 1>;<title 2>;..."
   ```
   The script appends new tasks under the same Story with
   `followup_of: <TASK-ID>` so `select-task.mjs` picks them first in the
   next cycle. Continue the current task only if its own
   `task_acceptance` can be met WITHOUT the stub (i.e. the stub would
   have been over-reach beyond this task's scope).
2. **Mark blocked** if the gap is ambiguous (design decision needed),
   or if the current task itself can't meet its `task_acceptance`
   without the stub. Set `status: blocked`, write a clear
   `blocked_reason`, log to AGENT-LOG, and stop the cycle. The human
   responds on the next cycle.

Never (3) ship the stub. Stubs in unfinished features affect downstream
tasks — that's the failure mode the feature-first architecture exists
to prevent.

Commit implementation with a descriptive message:

```bash
git add <specific-files>
git commit -m "feat/fix: <summary> (<TASK-ID>)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Step 8 — LOCAL VALIDATION

Before running validation, apply Prettier to the files you edited. New
files and edits that cross the print-width boundary reliably trip
`format:check` on the first pass (seen across TASK-006, TASK-007, and
TASK-010), costing a fix-cycle for a mechanical reformatting:

```bash
npx prettier --write <every file you touched in Step 7>
```

Then run every workspace command from `project.json.commands`:

```bash
commands.typecheck   # must pass
commands.lint        # must pass
commands.test        # must pass
commands.build       # must pass (if defined)
```

Record test counts per workspace (for regression detection in Step 10).

If any fail after 3 fix attempts:
- Reset: `git checkout -- .`
- Checkout main, delete branch: `git branch -D <branch>`
- Mark task `status: blocked` with a `blocked_reason` in roadmap.yml on main
- Write AGENT-LOG `outcome: blocked`
- Stop.

## Step 8.5 — STORY ACCEPTANCE CHECK

If this Task closes its Story (no other non-done tasks remain in the
Story), verify the Story's `acceptance_criteria` against the branch
diff. This is the gate that prevents "60+ cosmetic tasks shipped while
gameplay rotted" — the failure mode the feature-first architecture
exists to prevent.

```bash
STORY_ID=$(node scripts/select-task.mjs --print-story "$TASK_ID")
REMAINING=$(node scripts/story-remaining.mjs "$STORY_ID" "$TASK_ID")

STORY_VERIFIED=false
if [[ "$REMAINING" -eq 0 ]]; then
  # This Task closes the Story — run acceptance check
  AC_RESULT=$(node scripts/story-acceptance-check.mjs "$STORY_ID")
  AC_EXIT=$?
  case "$AC_EXIT" in
    0) STORY_VERIFIED=true  ;;  # all AC pass, scripted + LLM agree
    1) # AC failed: treat as Step 8 failure
       echo "==> Story acceptance check FAILED: $AC_RESULT" >&2
       git checkout -- .
       git checkout main
       git branch -D "$branch"
       node scripts/roadmap-update-task.mjs "$TASK_ID" --status blocked
       # AGENT-LOG: outcome=blocked, reason=story_ac_failed
       # Stop the cycle. Human review needed; AC failures aren't
       # retryable like typecheck failures — they reflect a semantic gap.
       exit 1
       ;;
    2) # No AC on Story (legacy) OR LLM unavailable — feature_complete
       #  stays "pending". Continue cycle.
       echo "==> Story acceptance check: unverifiable — feature_complete=pending" >&2
       ;;
    *) echo "==> Story acceptance check: infra error (exit $AC_EXIT)" >&2 ;;
  esac
fi
```

Capture `AC_RESULT` (JSON) and `STORY_VERIFIED` for Steps 9 + 10.

If verdict is `fail` (exit 1), the cycle stops here. The cycle's existing
"3-fix-attempts" loop does NOT apply — AC failures are semantic and need
human review, not blind retry. Mark `blocked_reason: "story_ac_failed:
<criterion>"`.

If verdict is `unverifiable` (exit 2), continue the cycle but
`finalize-task.sh` will NOT receive `--story-verified` (next).

## Step 9 — PUSH + PR

```bash
git push -u origin "$branch"

gh pr create \
  --title "<TASK-ID>: <title>" \
  --body "$(cat <<'EOF'
## Summary
Automated implementation of <TASK-ID>.

<1-3 bullets on what was done>

## Task details
- ID: <TASK-ID>
- Priority: <priority>
- Complexity: <complexity>
- Workspaces: <list>

## Test results
- <workspace>: <N> tests passed
- Typecheck: clean
- Lint: clean

## Automated
Generated by /autonomous-run.
EOF
)"

# Before enabling auto-merge, mark task done on the branch so the PR is atomic
# (implementation + status change merge together, never diverging)
```

Delegate the done-marking mechanics to `scripts/finalize-task.sh`. When
Step 8.5 verified the Story (STORY_VERIFIED=true), pass `--story-verified`
so the script ALSO stamps the parent Story's
`feature_complete: verified` + `verified_at: <iso>`:

```bash
if [[ "$STORY_VERIFIED" == "true" ]]; then
  scripts/finalize-task.sh "$TASK_ID" "$PR_URL" --story-verified
else
  scripts/finalize-task.sh "$TASK_ID" "$PR_URL"
fi
```

The script flips the roadmap task's status to `done`, stamps `pr` +
`completed`, optionally stamps Story feature_complete + verified_at,
re-renders ROADMAP.md, commits, and pushes to origin. It prints the
commit SHA on stdout. Exit codes: `0` ok, `1` if task id missing,
`2` on setup errors (invalid PR URL, running on main, etc.).

Then enable auto-merge:

```bash
gh pr merge <num> --auto --squash --delete-branch
```

## Step 10 — LOG CYCLE

Append to `AGENT-LOG.md` via the helper script
`scripts/append-agent-log.sh`. The helper stamps a canonical
`YYYY-MM-DD HH:MM` UTC timestamp, appends after the last existing
`### Run` block, and normalises the trailing `---` separator — all the
invariants `scripts/notify-cycle.sh`'s selector depends on. **Do not
write the heading line by hand or use `Edit` / `Write` to prepend near
the top of the file** — format drift there silently breaks
notifications.

Feed the entry body (everything below the heading) via stdin:

```bash
scripts/append-agent-log.sh <<'EOF'
- Task: <TASK-ID> — <title>
- Story: <STORY-ID> — <story title>
- Story progress: <doneCount>/<totalCount> tasks; AC verified: <yes|no|n/a (not terminal)>
- Picker reason: <follow-up | affinity | starvation-guard | default>
- Outcome: success
- PR: <url>
- Test counts: <workspace>=<N>, <workspace>=<N>, ...
- Files changed: <list>
- Regression alert: <true if any count decreased, else false>
- Story acceptance: <pass | fail(<criterion>) | unverifiable(<reason>) | n/a (not terminal)>
- Review proposed: <filled in Step 15 if applicable>
- Deploy: <filled in Step 14 if applicable>
- Tokens: <input>/<output>/<total> (cost: $<USD>)   # omit if CLI didn't expose it
- Lessons learned: <optional free text>
EOF
```

`Picker reason` comes from Step 5's `select-task.mjs` JSON output —
audit lens for when feature-first rules fire vs default ordering.

`Story acceptance` is `n/a (not terminal)` when this task didn't close
its Story (Step 8.5 didn't fire). When it did fire, the value mirrors
`scripts/story-acceptance-check.mjs`'s verdict.

The helper prints the heading it used (e.g. `### Run [2026-04-23 07:30]`)
on stdout — capture it if Steps 14 / 15 need to amend this entry in
place with `Edit`.

**Regression check:** run `scripts/regression-check.mjs` with the current
test counts; it parses the previous `success` entry's counts from
AGENT-LOG and compares per workspace.

```bash
node scripts/regression-check.mjs 'core=938, content=181, web=551, server=48, shared=18'
```

The script emits JSON `{regressed, workspaces: {name: {prev, curr, delta}}, missingInCurrent}`
and exits 1 on regression, 0 on clean, 2 on unreadable prior entry.
If exit=1, set `regression_alert: true` and outcome →
`success_with_warning`. If exit=2, treat the comparison as not-applicable
(first run of the cycle, fresh log) and leave `regression_alert: false`.

**Do NOT push the log entry to main yet.** Strict branch protection with
required status checks means any commit pushed to main *between* enabling
auto-merge (Step 9) and the PR actually landing puts the feature branch
into `mergeStateStatus: BEHIND` and auto-merge stalls indefinitely. Stage
the AGENT-LOG edit in the working tree here; Step 12 pushes it once the
PR has merged (and `git pull origin main` has brought in its squash
commit). The **review trigger is deliberately moved to Step 15 — AFTER
deploy completes and its outcome is logged** so that `/autonomous-review`'s
PR branch is created against the fully up-to-date main.

**Cross-project mirror (autodev-mcp).** If the MCP server is configured
in `.mcp.json` (connection name `autodev-mcp`), also mirror this cycle
into the cross-project store so the dashboard + cross-project
aggregates stay current:

1. Call `mcp__autodev-mcp__cycleMetrics.record` with `{projectSlug,
   startedAt, outcome, taskId?, prUrl?, inputTokens?, outputTokens?,
   costUsd?, ciDurationS?, regressionAlert?}` — same shape as the
   AGENT-LOG bullets.
2. Call `mcp__autodev-mcp__agentLog.recordEntry` with `{projectSlug,
   timestamp, taskId?, outcome, body}` where `body` is the full bullet
   list written above (kept intact for full-text search).

Both calls are best-effort — if the MCP connection is absent or the
tool errors (e.g. the MCP HTTP server is down), log a warning line and
continue. Never fail the cycle over a cross-project mirror failure;
the local `AGENT-LOG.md` remains the source of truth.

## Step 11 — (no skill-side notification)

**Do NOT fire any notification from this skill.** Notifications are
handled entirely by the systemd wrapper (`claude-{{slug}}.service`),
which runs `scripts/notify-cycle.sh` after this skill exits. That script
reads the latest AGENT-LOG entry and pushes to ntfy.sh.

If you invoke this skill interactively (not via systemd) and want a
manual notification, run the script separately *after* the skill
completes:

```
bash scripts/notify-cycle.sh
```

**The skill itself must never call notify-cycle.sh, never call
PushNotification, never curl ntfy.sh.** Every such call from inside the
cycle would duplicate the wrapper's push (both under systemd and
interactively when you add a second call yourself).

---

**Steps 12–14 only run if `deploy.autoDeployOnMerge: true`.**

## Step 12 — WAIT FOR MERGE + DEPLOY

Poll for up to 10 minutes (120 * 5s) waiting for PR merge:

```bash
gh pr view <num> --json state | jq -r .state  # expect: MERGED
```

Once merged, pull main:

```bash
git checkout main && git pull origin main
```

Now push the deferred AGENT-LOG entry from Step 10 (the squash-merge is
already on main, so this commit lands on top of it without racing the
feature branch):

```bash
git add AGENT-LOG.md
git commit -m "log: <TASK-ID> cycle entry (success, awaiting deploy)"
git push origin main
```

Invoke the `/deploy` skill. After it returns, edit the same AGENT-LOG
entry to fill in the `Deploy:` line with the outcome, then commit + push
again:

```bash
git add AGENT-LOG.md
git commit -m "log: <TASK-ID> deploy outcome (<success|rolled_back>)"
git push origin main
```

If PR doesn't merge in 10 min (CI slow or failing): append the log entry
to AGENT-LOG with `deploy: deferred, reason: pr_not_merged_in_time`,
commit + push to main (the feature PR's auto-merge has given up by then,
so the BEHIND race no longer applies), and stop (next run picks up).

## Step 13 — HEALTH CHECK

`/deploy` runs `scripts/healthcheck.sh` which polls `deploy.healthCheckUrl`
until 200 OK or `healthCheckTimeoutSec` elapses.

## Step 14 — ROLLBACK (if health fails)

If health check times out:
1. `/deploy` runs `scripts/rollback.sh` (restores previous image tag)
2. Mark THIS TASK as `blocked` with `blocked_reason: "deploy failed health check"`
   on main (direct commit — exceptional case)
3. Write AGENT-LOG `deploy: rolled_back`
4. Update the PushNotification from Step 11 (or re-send) with the
   `deploy.rolled_back` template from the table — this overrides the
   success notification that was sent pre-deploy-check
5. Do NOT cascade: other tasks are still pickupable. Next run proceeds.

## Step 15 — MAYBE REVIEW (fires LAST so main is up to date)

Count trailing consecutive `success` / `success_with_warning` entries in
AGENT-LOG.md. If the count is `>= successThreshold` AND:
- No REVIEW-LOG entry exists within that window
- No open PR matches `auto/review-*`

...then invoke `/autonomous-review`.

This step runs **last** — after Steps 10–14 have pushed AGENT-LOG + deploy-
outcome commits to main — so that the review skill's branch is created
against the fully up-to-date main. This eliminates the `mergeStateStatus:
BEHIND` race that otherwise stalls review PRs.

`/autonomous-review` is responsible for its own auto-merge + BEHIND-handling
(see its Steps 9 and 10). This skill just invokes it and returns.

If the review was triggered: amend the AGENT-LOG entry from Step 10 to set
`Review proposed: true` and include the review-PR number.

---

## After Step 15 (or Step 11 if no deploy AND no review): done.

Return control to the scheduler. Next fire will be on the configured cron.
