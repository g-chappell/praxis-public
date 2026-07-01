---
name: pm-brainstorm
description: Product Manager mindset. Explore a product idea or new direction, probe with Jobs-to-be-Done questions, and draft an epic with 2–4 stories ready to feed /roadmap-expand. Use when kicking off a new epic OR when the roadmap is running thin.
user-invocable: true
---

# /pm-brainstorm

Adopt a **Product Manager mindset**. The goal is to turn a vague idea into a
crisp epic with stories, not to design the solution.

## When to use

- User says "I want to add a new feature around X" but hasn't structured it
- Roadmap is running thin (fewer than N ready tasks)
- User is exploring a new direction and wants a thinking partner
- Invoked by `/init-autonomous` Phase 1

## Context to load first

Before asking anything, read:

- `roadmap/roadmap.yml` — so you don't propose duplicate work
- `AGENTS.md` (Tier 2 — project conventions)
- `~/.claude/memory/project_<slug>_vision.md` if it exists — the existing vision

Cite specific tasks/epics from roadmap.yml when relevant ("we already have
EPIC-03 covering X — is this different?").

## Interview flow

Ask one or two questions at a time. Never dump the whole list at once.

### 1. The job-to-be-done

- Who is the user for this? (role, context)
- What are they trying to accomplish? (the "job")
- What's the pain or friction today? (why the current state doesn't work)
- What would "done" look like for them?

### 2. Opportunity sizing

- Is this critical-path (blocks usage) or enhancement (improves usage)?
- How often will it be used? (daily / weekly / rare)
- How many users are affected?

### 3. Success criteria

- How will we know it worked? (observable metric or signal)
- What's the smallest slice that still delivers value? (MVP)
- What's explicitly out of scope?

### 4. Constraints

- Any hard dependencies on existing epics?
- Any non-functional constraints? (perf, security, compliance)

## Opportunity mapping

Based on the answers, surface **3–5 candidate directions** with trade-offs:

```
Option A — <title>
  - Effort: small | medium | large
  - Value: high | medium | low
  - Risk: <primary risk>
  - Approach in one sentence

Option B — ...
Option C — ...
```

Let the user pick one (or a combination). Do not decide for them.

## Output (draft epic)

Once the user picks, draft an epic structure. **Do not write to roadmap.yml
directly** — that's `/roadmap-expand`'s job. Produce a structured proposal
the user can accept/edit:

```yaml
epic:
  id: EPIC-<next>      # roadmap-expand assigns
  title: "<one short phrase>"
  description: |
    <2–3 sentences explaining the why and the scope>
  stories:
    - title: "<story title>"
      description: |
        <why this story exists + its narrow scope>
      acceptance_criteria: []   # filled by /ux-discovery in the next step
      tasks:
        - title: "<task title>"
          priority: high | med | low
          complexity: small | medium | large
          workspaces: [list of workspace names from project.json]
          description: |
            <detailed description — enough that the agent can implement
             without re-interviewing the user>
          depends_on: []   # IDs of other tasks if any
    - title: ...
```

Each story has 1–5 tasks (see Story authoring check below). Keep tasks small (≤ 1 day of work each).

## Story authoring check (before handoff)

Stories must be written at the **feature level** — a Story is complete
when all its tasks are `done` AND its acceptance criteria pass. For each
Story you drafted, verify:

- **Whole-feature deliverability.** When all tasks under this Story are
  done, does observable user value exist with no stubs / placeholders /
  mocked-out paths left behind? If not, the Story is too big or its task
  decomposition is wrong.
- **Single core AC.** Can the Story be summarised in one or two
  acceptance criteria? If not, refine the scope until it can.
- **Task count ≤ 5.** Stories spanning more than 5 tasks have historically
  produced the failure mode where the autonomous agent picks task-by-task
  while the feature as a whole rots (see colonize's 2026-05-12 strategic
  reset — 60+ sequential cosmetic-sprite tasks shipped while gameplay
  stayed unplayable end-to-end). Split larger Stories.

Ask the user explicitly: *"For each Story — when all its tasks are done,
what observable behaviour will exist that doesn't exist today?"* If the
answer needs more than one or two sentences, the Story is too big.

The draft above carries empty `acceptance_criteria: []` placeholders;
`/ux-discovery` fills them in the next step.

## Handoff

After the user approves the draft and Story authoring check passes:

```
Next step: run /ux-discovery on each Story before /roadmap-expand.
  - User-facing Stories:  /ux-discovery <story-or-paste>
  - Backend-only Stories: /ux-discovery <story-or-paste> --backend
Then /roadmap-expand to commit to roadmap.yml.
```

`/ux-discovery` is **mandatory** in the new flow — it fills `acceptance_criteria`,
`user_flow`, `out_of_scope`, and per-task `task_acceptance`. Without these,
the autonomous cycle's Step 8.5 acceptance check skips and the Story will
sit at `feature_complete: pending` indefinitely.

## Anti-patterns to avoid

- Don't decide tech stack here — that's the architect's job (Phase 2 or a
  separate discussion)
- Don't write code or skeleton files
- Don't propose 10+ tasks for a single epic — split into multiple epics
- Don't re-propose work that already exists in roadmap.yml — flag it first

## Memory

If the brainstorm surfaces a durable insight about the product (new user
segment, new constraint, pivot in vision), update
`~/.claude/memory/project_<slug>_vision.md` after the user confirms.
