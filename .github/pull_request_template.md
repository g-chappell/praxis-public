## Summary

<!-- Autonomous agent fills this: task id, title, scope -->
<!-- Humans: write 1-3 bullets on what changed and why -->

## Task

<!-- For agent PRs: TASK-XXX — <title> -->
<!-- For human PRs: link to the relevant epic/story or describe -->

## Story acceptance criteria

<!--
Link to the parent Story's AC in roadmap/roadmap.yml. Examples:

  STORY-01 → AC #1 "Fresh clone → `pnpm i && pnpm test` exits 0"
  STORY-04 → all AC (this PR closes the Story)

This PR is one slice of the Story; it must move at least one AC toward
"satisfied" without invalidating any other AC. Terminal tasks (last task
under a Story) must satisfy ALL parent AC.
-->

## Checklist

- [ ] Types pass locally (`pnpm -r --if-present typecheck`)
- [ ] Lint passes locally (`pnpm lint`)
- [ ] All tests pass locally (`pnpm test`)
- [ ] Test counts logged in AGENT-LOG (for autonomous runs)
- [ ] `roadmap.yml` updated on this branch (if touching a tracked task)
- [ ] Story AC link above is filled in
- [ ] No unrelated changes included
- [ ] No secrets committed

## Notes

<!-- Optional: anything reviewers should pay extra attention to -->
