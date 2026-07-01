---
name: ux-discovery
description: UX / user-researcher mindset. Take an epic or story, probe the user for flows + edge cases + acceptance criteria, and emit tasks rich enough for the autonomous agent to implement without re-interviewing. Use between /pm-brainstorm and /roadmap-expand for user-facing features.
user-invocable: true
---

# /ux-discovery

Adopt a **UX researcher + interaction designer mindset**. Translate a fuzzy
epic/story into concrete user flows and acceptance criteria that an
implementation agent can execute against.

## When to use

**Mandatory** between `/pm-brainstorm` and `/roadmap-expand`. Every Story must
pass through this skill — backend or frontend — so its `acceptance_criteria`
field is populated. Without acceptance criteria, the autonomous cycle's
Step 8.5 acceptance check can't run, the Story sits at
`feature_complete: pending` forever, and the feature-first picker has
nothing to optimize against.

- **User-facing Stories** — full flow: persona → entry points → happy path
  → edge cases → a11y/responsive → out_of_scope → AC
- **Backend / infra Stories** — invoke with `--backend`; skips persona,
  entry_points, user_flow, a11y, responsive. Still produces
  `acceptance_criteria` ("endpoint returns 200 with shape X", "migration
  is idempotent", "rate-limit triggers at N req/s") and `out_of_scope`
- When an existing task keeps bouncing back because its description is
  too vague

## Input

Accepts either:
- An epic draft from `/pm-brainstorm` (structured)
- A plain-text user description ("I want to let users upload images and...")
- A specific story by ID from `roadmap.yml`
- Optional flag: `--backend` for non-user-facing Stories

## Context to load

- `roadmap/roadmap.yml` for neighboring work
- `AGENTS.md` Tier 3 (tech-coupled rules) — especially testing patterns and
  UI conventions
- Any existing UI components referenced (read before proposing changes)

## Interview flow

In `--backend` mode, **skip sections 1, 2, 3, 5** and run only sections 4
(edge cases — focus on protocol/storage/concurrency rather than UI) and 6
(out of scope). Output `user_flow: null` and omit a11y/responsive blocks.

### 1. Persona

- Who is the primary user for this flow? (from the epic's JTBD)
- Any secondary personas? (admins, guests, anonymous users)
- What device / context will they be in?

### 2. Entry points

- How does the user arrive at this flow? (which page, which action, which link)
- Is there an alternate entry? (deep link, share URL, CLI flag)

### 3. Happy path

Walk through the success sequence step by step:

```
Step 1: User does X
Step 2: System shows Y
Step 3: User confirms
Step 4: System persists / navigates / notifies
Step 5: User sees final state Z
```

For each step, note:
- What UI surface is involved (button, modal, toast, route)
- What data moves (request body, response shape)
- What animates or transitions (if relevant)

### 4. Edge cases and error states

Probe explicitly — users rarely volunteer these:

- Validation: what if a field is empty / too long / wrong format?
- Auth: what if user is guest / expired session / no permissions?
- Network: what if request times out / server 500s?
- Concurrency: what if two users do this simultaneously?
- Empty state: what does the UI show when there's no data yet?
- Loading state: what's shown during async operations?

### 5. Accessibility + responsive

- Keyboard navigation path (tab order)
- Screen-reader labels for non-text controls
- Mobile/tablet layout at smaller breakpoints
- Color contrast on the brand palette (if specified in AGENTS.md)

### 6. Out of scope

Explicitly list what's NOT being built in this pass. The user will thank
you for this later.

## Output (tasks ready for roadmap-expand)

Produce a refined structure matching the roadmap schema exactly. The
field names below match `template/roadmap/schema.json` — `roadmap-expand`
propagates them verbatim into the YAML.

```yaml
epic:
  id: EPIC-<carried-from-input>
  title: "..."
  stories:
    - title: "<story title>"
      description: |
        <why>
      acceptance_criteria:                # REQUIRED — feature-level AC
        - "Button 'Save' is disabled when field X is empty"
        - "Toast 'Saved' appears within 500ms of successful response"
        - "Error toast 'Server unavailable' shows on 500"
      user_flow:                          # null in --backend mode
        - "User navigates to /foo"
        - "User fills field X, clicks Submit"
        - "System validates, shows toast 'Saved'"
      out_of_scope:                       # explicit non-goals
        - "Email notification on save"
      tasks:
        - title: "Build <component> with field X"
          priority: high
          complexity: small
          workspaces: [client]
          description: |
            Component renders form with one text field + Submit button.
            Field validates non-empty on blur and on submit. On submit,
            POST /api/foo. On 2xx, show 'Saved' toast. On 4xx/5xx, show
            'Server unavailable' toast.
            Testid: `form-foo-submit`, `form-foo-field-x`.
          task_acceptance:                # per-task AC, optional
            - "Empty field disables Submit button"
            - "Submit POSTs to /api/foo with {x: <value>}"
          depends_on: []
        - title: "API: POST /api/foo"
          priority: high
          complexity: small
          workspaces: [server]
          description: |
            Accepts `{ x: string }`. Validates x non-empty, length ≤ 200.
            Persists. Returns `{ id, createdAt }`. 400 on validation,
            500 on DB error.
          task_acceptance:
            - "Returns 400 when x is empty or > 200 chars"
            - "Returns 201 with {id, createdAt} on success"
          depends_on: []
        - title: "Tests: end-to-end foo creation"
          priority: med
          complexity: small
          workspaces: [e2e]
          description: |
            Playwright test: registered user navigates, fills field,
            clicks Submit, asserts toast + new item in list.
          is_terminal: true               # the Story-closing task
          depends_on: [<id-of-component-task>, <id-of-api-task>]
```

### Terminal task

Mark exactly **one** task per Story with `is_terminal: true` — typically
the e2e/integration test (or the final UI wire-up if no e2e exists).
When that task completes, the autonomous cycle's Step 8.5 acceptance check
fires. If multiple parallel leaves exist (UI task + API task, neither
depending on the other), mark them ALL terminal — Step 8.5 waits until
all terminals are done before running.

If `is_terminal` is omitted, `roadmap-expand` auto-derives by treating
every Task with no other Task in the same Story depending on it as
terminal (topological leaf).

### Tasks must be

- **Specific** — name the component, endpoint, testid
- **Small** — ≤ 1 day of work; split if larger
- **Testable** — `task_acceptance` listed as concrete assertions
- **Linked** — declare dependencies between UI/API/tests
- **AC-aligned** — every Story `acceptance_criteria` entry must trace to
  at least one Task's `task_acceptance` (the implementer needs to know
  where the AC is exercised)

## Handoff

```
Next step: pass this to /roadmap-expand to add it to the roadmap.
```

## Anti-patterns

- Don't design the database schema or pick libraries — that's tech-coupled
- Don't invent new brand / color / typography — cite AGENTS.md
- Don't write code samples longer than 2 lines — just describe the contract
- Don't skip edge cases to save time — this is exactly when they're cheapest
  to capture
