---
name: commit-checkpoint
description: Commit the current work as a clean checkpoint with an imperative-mood message. Use after finishing a coherent unit of work, before any destructive change, or whenever the user asks to save/checkpoint/commit. Keeps the git history a readable story of how the app was built.
user-invocable: true
---

# /commit-checkpoint

Save the current state of the project as a git commit so the workspace's git
panel shows a clear, step-by-step history. Commit **proactively** — you don't
need to be asked.

## When to commit

- A coherent unit of work is done (a feature, a fix, a refactor) **and the app
  still builds/runs**.
- **Before** anything destructive or risky (deleting files, big rewrites,
  `git reset`) — so there's a safe point to return to.
- The user says "save", "checkpoint", or "commit".

If little has changed since the last commit, say so and skip — don't make empty
or trivial commits.

## How to do it

1. See what changed: `git status` and skim `git diff`.
2. Make sure nothing secret or generated is being added (`node_modules/`,
   `dist/`, `.env*`). These are git-ignored in this template; don't force-add them.
3. Stage and commit in one step:
   ```bash
   git add -A && git commit -m "<message>"
   ```

## Writing the message

Imperative mood, concise, describes the change and why it matters — reference the
work, not the mechanics. One line is usually enough.

- ✅ `Add a rotating textured cube with orbit controls`
- ✅ `Load a stone texture onto the floor plane`
- ✅ `Fix camera clipping when zoomed in close`
- ❌ `update`, `wip`, `changes`, `fixed stuff`, `commit 3`

For a larger change, add a short body after a blank line explaining the _why_.

## After committing

Briefly tell the user what you checkpointed (one line) so they can find it in the
git panel.
