# Development Strategy

**Document type:** Working agreement for two-person async build
**Status:** Initial; revisit after two weeks of contact with reality

---

## Working assumptions

Two contributors, distributed, no formal time commitment — roughly a handful of hours per week each. One weekly sync call. Everything else asynchronous.

This shapes three things: small work units, repo-as-source-of-truth, and a meeting cadence that resolves blockers without becoming the bottleneck.

---

## Meeting cadence

**One weekly voice call.** 45–60 minutes, same slot each week. Agenda:

- Status update from each side (a few minutes each — what shipped, what's in flight, what's blocked)
- Decisions that need a joint call (architecture, scope changes, priority shifts)
- Roadmap check (are we tracking against the milestone)
- Demo of anything new

If there's nothing to discuss, the call is short. If there's a lot, the structure prevents drift.

**Async between calls.** PR comments and GitHub issue threads for anything tied to specific work. A shared chat channel (Discord or similar) for ad-hoc questions. Loom or short video for anything visual that doesn't justify a synchronous call. No DMs for project work — decisions should be findable in the repo or the chat.

---

## Branching strategy

**Trunk-based development.** `main` is always deployable. Auto-merge enabled; branch protection requires the `ci` check.

- Short-lived branches off `main`
- **Story PRs use `auto/<TASK-ID>-<slug>`** (the prefix is convention, not a claim of autonomous run — see AGENTS.md tier-2). Ad-hoc human PRs use `<initials>/<slug>` (e.g. `gw/fix-typo`).
- **One Story → one PR, per-task commits.** Per AGENTS.md tier-1: a Story's tasks land on the same branch as separate commits; the terminal task's commit closes the Story. Don't size PRs by line count; size them by Story scope. Refine over-large Stories via `/roadmap-add` rather than splitting the PR.
- Open PRs early as drafts to signal direction.
- The other contributor reviews; for non-architectural PRs, "ship it" is enough.
- If the other side is unavailable for over 24 hours and the change is non-architectural, self-merge with a note on the PR.
- Architectural changes (schema, new external dependencies, ACP/sandbox interfaces, security-relevant code) require the other contributor's review before merge — no self-merge exceptions.

**CI.** Required check is `ci` (Prettier + ESLint, `tsc --noEmit` across workspaces, Vitest, production build). `e2e` (Playwright sign-in flow) runs alongside as a non-blocking signal. Lint + format choice is Prettier 3 + ESLint 9 per ADR-0003 (Biome was the original pick and was reversed). Target under two minutes for `ci`; `e2e` adds another 60–90 seconds.

---

## Work distribution

Component ownership reduces conflict on shared surfaces. Each component has a primary owner who is the deciding voice on its design; the other contributor can propose changes via PR.

| Component | Primary | Notes |
|---|---|---|
| Frontend (Next.js, workspace UI) | A | |
| Orchestrator and ACP host | B | |
| Sandbox layer + Docker infrastructure | B | |
| Templates (scaffold, MCP config) | A | |
| Auth and OAuth flows | Either | |
| MCP servers (image gen for POC) | B | |
| Curated learning content | Either | |
| Documentation and ADRs | Both | Equally |
| Deployment and ops | B | |

The split is a starting suggestion based on natural component boundaries. Refine it in the first sync if it doesn't match your strengths or interests.

**Task management.** The roadmap lives in `roadmap/roadmap.yml` in this repo — Stories with `acceptance_criteria`, `user_flow`, `out_of_scope`, and child Tasks. That YAML is the source of truth; `node roadmap/render.mjs` produces a human-readable `ROADMAP.md`, and `node scripts/sync-issues.mjs` mirrors Stories + Tasks to GitHub Issues so the GH UI stays useful for review and discussion. Branch-as-payload: status changes (`ready` → `in_progress` → `done`) travel through the PR via `node scripts/roadmap-update-task.mjs`, never committed directly to main.

If you both want to work on the same area, claim a Story explicitly and resolve overlap in the weekly call or async chat. Per AGENTS.md tier-1, work strictly outside the Story's scope is forbidden — refine via `/roadmap-add` first.

---

## Documentation conventions

`AGENTS.md` at the root is the primary cross-tool agent-context file; `CLAUDE.md` is a one-line importer of it. Per-workspace `AGENTS.md` files override at sub-folder scope (e.g. `services/orchestrator/AGENTS.md`). Topic-specific cookbooks live in `docs/conventions/` (deploy, database, auth-and-mail). Per-deployable ops procedures live in `docs/runbooks/`. ADRs in `docs/decisions/` cover any decision that crosses component boundaries or introduces a new external dependency.

Both contributors maintain these files as the codebase evolves. The discipline pays off — both for the two of you and for any AI agents working on the code.

**Two rules of thumb.** First: if you've explained the same thing twice, write it down. Second: if you find yourself disagreeing with a decision someone made a week ago, check whether there's an ADR; if not, that's the gap to fix.

---

## Iteration

This document is itself a starting hypothesis. After two weeks of building, revisit. Things likely to shift: component ownership (real work surfaces real specialisations), PR size discipline (the natural batch size will reveal itself), sync frequency (weekly may be too rare or too frequent).

Update this file rather than holding the change in your head.
