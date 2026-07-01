# 0017 — Cross-session agent memory: persist the SDK store + ACP session/load

**Date:** 2026-06-05
**Status:** Accepted (2026-06-05) — signed off by both contributors per AGENTS.md (ACP changes require an ADR + both-contributor confirmation). Implemented by STORY-36.

## Context

A user told the agent to remember a word, refreshed/returned later, and the agent had forgotten. Two layers sit underneath that:

- **Refresh** (same session) — fixed by STORY-35: a reconnect grace window keeps the room + persistent agent (ADR-0016) alive across a brief disconnect, so the live conversation survives. Done.
- **A true teardown** (closed tab, idle sweep, next-day return) — the agent process is gone and a fresh one starts. This ADR addresses making the agent **remember across that boundary**.

ADR-0016 made the agent persistent *within* a session and explicitly noted that a re-open "resets conversation memory (filesystem state persists)." This ADR is the decision to stop that reset by persisting what a session learned.

**Why nothing survives a teardown today (evidence):**

- The Claude Agent SDK / `claude-agent-acp` store **session history and config under the home directory** — `~/.local/share/claude/sessions/` and `~/.config/claude/` (Agent SDK docs, see References). The agent's native memory writes there too.
- In our sandbox only **`/workspace`** is durable: it's bound to the named volume `praxis-project-<id>` and snapshotted to MinIO on `stop()` / restored on `start()` (ADR-0008, `packages/sandbox/src/docker-sandbox.ts`). The container **home directory is the ephemeral writable layer** — destroyed when the container is removed.
- So the agent's memory and transcripts land on ephemeral storage. The user's "memory file" almost certainly went to `~/.…/claude/…` and was wiped on teardown — "didn't persist," not "didn't reload."

**What the adapter already gives us:** `claude-agent-acp` **supports ACP `session/load`** — experimental in 0.16.0, stabilized by 0.22.0; we run **0.39.0** (References). The protocol can resume a prior session by id with full conversation history. Our `AcpHost` just never uses it — `ClaudeAgentSession.open` always calls `newSession`. The missing piece is **durable storage**, not protocol support.

`AcpHost` is one of the two sacred abstractions; introducing a load/resume path changes its session-creation contract — hence this ADR.

## Decision

**Make a project's agent memory durable, and resume the prior conversation on a fresh session, by (1) relocating the SDK's store onto a persisted location and (2) adding an ACP `session/load` path to `AcpHost`.**

Two coupled changes:

1. **Persist the agent's store.** Point the in-sandbox agent's HOME (and thus `~/.local/share/claude` + `~/.config/claude`) — or the equivalent SDK config dir — at a **durable path that survives teardown**. The exact mechanism is an implementation/verification task (see Consequences), with two candidates:
   - **(a) HOME under the project volume** — set the agent process `HOME` to e.g. `/workspace/.praxis-agent` (already on the named volume + MinIO snapshot). Simplest; reuses all existing persistence. Cost: it lives inside the user's workspace (must be hidden + git-ignored + excluded from "files" views), and it inflates the MinIO snapshot.
   - **(b) A dedicated persisted agent-home volume** — a separate `praxis-agent-home-<projectId>` volume mounted at the agent's HOME, snapshotted on its own. Cleaner separation from the user's repo; more plumbing in `packages/sandbox`.
   The chosen option is settled in the implementing Story after a sandbox verification of *where* `claude-agent-acp@0.39.0` actually writes and *which* env var (`HOME` vs a config-dir override) relocates it.

2. **Resume via `session/load`.** Persist the ACP `sessionId` per project (DB column on `sessions`/`projects`, or a file in the store). On `openAgent`, if a prior sessionId exists for the project and its history is present in the now-durable store, call **`connection.loadSession({ sessionId, … })`** instead of `newSession`; fall back to `newSession` (fresh) if load fails or no prior session exists. The `AcpHost` interface gains this resume capability (e.g. `openAgent(…, { resumeSessionId? })`), preserving the swap-point for other ACP agents.

Net effect: a user returns to a project and the agent picks up the prior conversation (transcript via `session/load`) and any durable memory it wrote (now on a persisted path) — across a real teardown, not just a refresh.

## Consequences

- **The `AcpHost` swap point is preserved**, extended from open-or-create to open-with-optional-resume. A native-ACP Codex still implements the same shape; both `newSession` and `loadSession` are standard ACP.
- **A sandbox verification task is mandatory before implementation** — confirm the actual on-disk store path for `claude-agent-acp@0.39.0` + the bundled `@anthropic-ai/claude-code`, and the relocation env var. The Agent SDK docs we have are third-party; do not hard-code `~/.local/share/claude` without verifying in the real base image.
- **Storage growth + privacy.** Persisting per-project transcripts/memory grows MinIO usage and means more user content at rest — it must ride the existing encryption/retention posture (the snapshot store), and be covered by the deletion path (project delete must purge the agent store too — extend `purgeProjectRooms` / `DockerSandbox.destroy`). Surfacing an "agent forgot / reset memory" control is a likely follow-up.
- **Failure handling.** A corrupt or version-incompatible session store must degrade to a fresh `newSession` with a surfaced "couldn't resume earlier conversation" notice (reusing the STORY-33 `agent_restarted`-style channel), never a hard error.
- **Interaction with ADR-0016 + STORY-35.** This sits on top: STORY-35 keeps the *live* session across refreshes; ADR-0016 keeps *one shared* agent; this ADR keeps memory across *teardowns*. The grace window still does the fast-path; `session/load` is the cold-start path.
- **Multiplayer note.** One shared agent per room (ADR-0016) means one shared session id per project — resume restores the *pair's* shared history, consistent with the platform model. No per-user transcript split (out of scope, as in ADR-0016).
- **Idle-shutdown unchanged.** This doesn't touch the 30-min sweep; it changes what a *new* session can recover, not how long sandboxes live.
- **Reversibility:** reverting is dropping the resume path (back to `newSession`) and unmounting the persisted store — no consumer rewrite.

## Alternatives considered

- **Workspace `CLAUDE.md` convention only** (the "A" option). Steer the agent to record durable facts to `/workspace/CLAUDE.md`, which already persists and is read at session start (ADR-0009). Far simpler, no ACP change, no ADR — but it preserves *curated facts*, not the actual conversation, and depends on the agent reliably writing them. Good as a near-term partial; rejected as the *full* answer because it doesn't restore the session. (Could still ship alongside as a cheap win.)
- **Do nothing beyond STORY-35.** Refresh works; true teardowns still forget. Legitimate interim, but not the requested end state — the operator explicitly chose full resume.
- **Persist the store but keep `newSession`** (no resume). Memory tool / CLAUDE-style files would survive, but the conversation transcript wouldn't reload without `session/load` — half the value for most of the work. Rejected.
- **External memory layer** (e.g. a `claude-mem`-style hook capturing transcripts into our own store and re-injecting). More moving parts and a second source of truth; the adapter's native `session/load` is the lower-surface path now that we know it's supported. Rejected for the POC.

## References

- **ADR-0016** — persistent shared agent per room (the in-session half this builds on; "conversation memory resets on re-open" is the line this ADR removes).
- **ADR-0008** — sandbox snapshots via object store (the `/workspace` persistence boundary; home dir is not covered).
- **STORY-35** — reconnect grace window (the refresh-path fix this complements).
- `claude-agent-acp` CHANGELOG — session loading experimental in **0.16.0**, "Use SDK functions for listing and loading session history" **0.19.0**, stabilized **0.22.0**; we pin **0.39.0** (`sandbox-base/Dockerfile`). <https://github.com/agentclientprotocol/claude-agent-acp/blob/main/CHANGELOG.md>
- Claude Agent SDK memory/context — session history under `~/.local/share/claude/sessions/`, config under `~/.config/claude/` (third-party docs — **verify against the base image before implementing**). <https://github.com/bgauryy/open-docs/blob/main/docs/claude-agent-sdk/memory-and-context.md>
- `packages/sandbox/src/docker-sandbox.ts` — `/workspace`-only named volume + MinIO snapshot/restore.
- AGENTS.md — sacred `AcpHost`; ACP changes need an ADR + both-contributor confirmation.
