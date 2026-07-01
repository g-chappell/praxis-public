---
name: roadmap-add
description: Add a single epic, story, or task to roadmap.yml without a full interview. Use for quick additions — a one-line task under an existing story, or a single story under an existing epic. For multi-task epics use /pm-brainstorm → /roadmap-expand.
user-invocable: true
---

# /roadmap-add

Fast-path for single additions. No interview. No branch (optional), no PR —
this skill is for when you know exactly what to add.

## When to use

- "Add a task to clean up dead code in EPIC-03 / STORY-05"
- "Add a story under EPIC-02 about rate limiting"
- Quick fixes during a dev session (the user will commit it themselves)

**When NOT to use:** adding a whole new feature area → `/pm-brainstorm` first.

## Input

The user provides:
- **What** to add: task, story, or epic
- **Where** to nest it: parent ID (REQUIRED — no orphan tasks or stories)
- **Required fields** (collected if not provided):
  - Task: title, priority, complexity, workspaces, description, **parent story ID**
  - Story: title, description, **parent epic ID**, acceptance_criteria
  - Epic: title, description

## Steps

1. Load `roadmap/roadmap.yml`
2. Find max existing ID of the right type → compute next ID
3. **For Tasks:** require the parent Story ID. Load that Story.
   - If the Story has empty `acceptance_criteria`, prompt:
     *"Story <id> has no acceptance_criteria — the autonomous cycle's
     Step 8.5 acceptance check will skip and the Story can't reach
     `feature_complete: verified`. Add AC now (recommended) or skip
     (warning will be logged)?"*
   - If user adds: prompt them for 1–3 AC strings; add them to the Story.
   - If user skips: proceed but ensure they understand the consequence.
4. **For Stories:** require `acceptance_criteria` upfront. If the user
   declines to specify any, suggest running `/ux-discovery <story>` first.
5. Insert the new node in the right place
6. Run `node roadmap/validate.mjs` — fix issues before writing (warnings
   on missing AC are expected during the legacy-roadmap migration window;
   hard errors block commit)
7. Run `node roadmap/render.mjs`
8. Show the user the diff of `roadmap.yml`
9. Ask: "Commit now? [y]es (on a roadmap/... branch + PR) / [d]raft (stage only) / [n]o"

On "yes":
```bash
git checkout -b roadmap/add-TASK-<id>
git add roadmap/roadmap.yml ROADMAP.md
git commit -m "roadmap: add <id> <title>"
gh pr create --title "..." --body "..."
gh pr merge --auto --squash
```

## Defaults

If the user doesn't specify:
- Task status: `ready`
- Task priority: `med`
- Task complexity: `small`
- Task workspaces: `[]` (warn — tasks with no workspace often can't be auto-picked up)
- depends_on: `[]`
- task_acceptance: `null` (the agent uses parent Story's `acceptance_criteria` if unset)
- is_terminal: derived at validate time from topological leaves (see roadmap-expand Step 3a)
- followup_of: `null` (only set by `scripts/roadmap-followup.mjs`)

For Stories without explicit `acceptance_criteria`, the validator emits
a warning (never an error) — the Story functions but won't trigger Step 8.5.

## When NOT to use this skill

- **Multi-task epic** — use `/pm-brainstorm` → `/ux-discovery` → `/roadmap-expand` instead
- **Adding a Story without thinking through its AC** — run `/ux-discovery <topic>` first; come back here only if you genuinely have a one-off Story shape
