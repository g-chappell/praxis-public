# 0016 — A single persistent shared agent per project room

**Date:** 2026-06-05
**Status:** Accepted (2026-06-05) — signed off by both contributors per AGENTS.md (ACP changes require an ADR + both-contributor confirmation). A single shared live coding session is the platform's core premise; implemented by STORY-33.

## Context

Multiplayer surfaced for real once a second user joined a shared project via the
STORY-31 invite link. Two defects appeared. The first — separate session rooms
per connection — is a plain bug fixed by STORY-32 (shared room + shared chat
visibility, no interface change). The second is architectural and is what this
ADR addresses: **there is no single agent for two users to share.**

`ClaudeAcpHost.spawnAndPrompt` (`packages/acp-host/src/acp-host.ts`) is
turn-scoped. Per prompt it:

1. `sandbox.spawn(handle, 'claude-agent-acp', …)` — a fresh agent **process**;
2. `connection.newSession(…)` — a brand-new ACP session;
3. `connection.prompt(…)` — exactly one turn;
4. `finally { await proc.kill() }` — **kills the process when the turn ends.**

Consequences of the current shape:

- **No conversation continuity, even for one user.** Each prompt is a new agent
  with a new ACP session and no memory of prior turns (only the filesystem
  persists). "Continue what we were doing" doesn't work; the agent re-derives
  context from disk every turn.
- **No shared agent for two users.** With STORY-32's shared room, two users see
  each other's prompts and output, but if both prompt they each spawn their own
  ephemeral agent — two processes, two ACP sessions, racing on the same
  `/workspace`. "Sharing the same single agent" is impossible by construction.

ADR-0009 already named the product requirement this misses. It justified the
platform-API-key model precisely because the pair must share **"one aligned
session"** (§ "The product requirement behind 'subscription' … (b) the pair
shares one aligned session"), and noted that *"a single credential per
`spawnAndPrompt` call is the owner-pays model."* The billing decision landed;
the **session-sharing** half was never implemented — `spawnAndPrompt` is
per-turn, so the "one aligned session" is, today, one-aligned-session-per-prompt
that immediately dies. This ADR makes ADR-0009's "one aligned session" literal.

This also unblocks the requested **prompt-control modes** (serialised queue /
turn-based handoff): you can only arbitrate control of *one* agent. Without a
persistent shared agent, "whose turn is it" has no referent.

`AcpHost` is one of the two sacred abstractions and the swap point for future
ACP agents (Codex). Changing its **interface shape** is what triggers this ADR —
not the internals.

## Decision

**Make the agent a persistent, room-scoped session: one long-lived
`claude-agent-acp` process + one ACP session per project room, opened lazily on
first prompt, shared by every user in the room, and torn down with the room.**

Reshape the `AcpHost` interface from one turn-scoped generator into a session
lifecycle (illustrative — exact names settled in the implementing Story):

```ts
export interface AcpHost {
  /** Spawn the agent in `handle` and open one ACP session. The returned handle
   *  is long-lived: many prompt turns run over it until close(). */
  openAgent(sandbox: Sandbox, handle: SandboxHandle, apiKey: string): Promise<AgentSession>;
}

export interface AgentSession {
  /** Drive one turn over the persistent session; stream typed events. Serialised
   *  by the caller — one active turn at a time per session (see Consequences). */
  prompt(text: string, options: PromptOptions): AsyncIterable<AcpEvent>;
  /** Cancel the in-flight turn (ACP cancel) without ending the session. */
  cancel(): void;
  /** End the ACP session and kill the process. Called on room teardown. */
  close(): Promise<void>;
}
```

The orchestrator holds the `AgentSession` on the `SessionRoom` (`runtime.ts`),
opens it on the first prompt, routes every user's prompt through it, broadcasts
its events to the room (STORY-32), and `close()`s it in `endSession`.

- **One key per session, bound at open.** `apiKey` is supplied once to
  `openAgent` (the project owner's platform key, ADR-0009) and authenticates the
  whole shared session — strictly *more* aligned with ADR-0009's owner-pays
  "one aligned session" than per-prompt keying. Metering still reads
  `turn-complete` usage; per-user attribution (STORY-12) is carried on the
  orchestrator's prompt frame, not the key.
- **Turns are serialised per session.** ACP sessions are single-turn-at-a-time;
  the orchestrator must not start a second `prompt()` while one is in flight.
  How that serialisation is *surfaced* to users (auto-queue vs. turn-based
  handoff) is the prompt-control-modes Story — this ADR only mandates that the
  host enforce one active turn per session.

## Consequences

- **The `AcpHost` swap point is preserved**, just at session granularity instead
  of turn granularity. A native-ACP Codex still implements `openAgent`/`prompt`/
  `close`. The ACP wire stays literal (still `newSession` + `prompt`, just not
  torn down between turns).
- **Conversation continuity arrives as a side effect** — the same ACP session
  across turns means the agent remembers the pair's prior turns, for one user or
  two. This is a UX improvement beyond multiplayer.
- **Lifecycle/error handling gets harder and must be designed in the Story, not
  deferred:**
  - *Agent crash mid-session.* `connection.closed` firing no longer just ends one
    turn's iterator — it must mark the room's agent dead and transparently
    re-`openAgent` on the next prompt (a new ACP session; filesystem state
    persists, conversation memory resets). Surface a "the agent restarted" notice
    rather than a silent context loss.
  - *Cancellation.* `cancel()` cancels the current turn but keeps the session;
    only `close()` kills the process. Today's `signal`→`proc.kill()` coupling is
    removed.
  - *Idle teardown.* Tie `close()` to the existing last-socket-leaves /
    30-min-idle teardown (`endSession`, the sweep) — the persistent process must
    not outlive the room or leak when everyone disconnects. No relaxation of the
    idle-shutdown rule.
- **Permission routing becomes a real question.** `requestPermission` can now
  arrive at any time during a shared session, not within one user's single
  `spawnAndPrompt`. For this ADR's scope, auto-allow is retained (as today). When
  interactive permissions land, requests route to the controlling user — which
  presupposes the prompt-control-modes Story; called out so it isn't missed.
- **Concurrency safety improves**: one shared agent on `/workspace` replaces the
  two-agents-racing hazard that exists today (and would worsen under STORY-32's
  shared room). The serialisation requirement is what delivers this.
- **Migration is internal.** `runtime.ts`, `ws.ts` (`runPrompt`), and the
  `acp-host` package change; no consumer outside the orchestrator imports
  `spawnAndPrompt`. The integration tests (real subprocess, recorded transcript)
  extend to a multi-turn session.
- **Reversibility:** returning to turn-scoped agents is a new ADR + a host swap;
  nothing else depends on the per-turn shape once consumers move to the session
  API.

## Alternatives considered

- **Keep spawn-per-prompt; restore continuity via ACP `session/load`.** Persist
  the `sessionId` on the room and `loadSession` instead of `newSession` each
  turn, still killing the process between turns. Gets conversation continuity
  without a long-lived process, but **does not give two users one shared live
  agent** — the agent isn't *present* between turns, control modes still have no
  referent, and cold session-load every turn adds latency. Rejected: solves the
  lesser half.
- **One agent process, but a new ACP session per prompt over it.** Avoids respawn
  cost but still discards conversation memory each turn and gains nothing for
  sharing — the session, not the process, is the unit users share. Rejected.
- **Per-user persistent agents in the shared room.** Each user keeps their own
  long-lived agent; broadcast both streams. Preserves per-user threads but
  re-creates the two-agents-on-one-`/workspace` race, doubles spend, and is the
  opposite of "share the same single agent." Rejected against the explicit
  requirement.
- **Do nothing (ship STORY-32 only).** Multiplayer *visibility* works; the agent
  stays per-prompt and per-user. Legitimate as an interim — STORY-32 is exactly
  this — but it is not the requested end state and leaves the control-modes Story
  unfoundable. This ADR is the decision to go past the interim.

## References

- **ADR-0009** — ACP host via the Zed adapter on a platform API key. Establishes
  the "one aligned session" product requirement and the owner-pays key model this
  ADR makes literal; the `AcpHost` swap-point and the no-`CLAUDE_CODE_OAUTH_TOKEN`
  rule are unchanged.
- **STORY-32** (roadmap, EPIC-03) — shared room + shared chat visibility; the
  no-interface-change half of the multiplayer fix this ADR sits on top of.
- **AGENTS.md** — "Two abstractions are sacred"; "Change anything ACP- or
  MCP-related only with an ADR and confirmation from both contributors";
  idle-shutdown is non-negotiable.
- `packages/acp-host/src/acp-host.ts` — current turn-scoped `spawnAndPrompt`
  (`finally { proc.kill() }` at the end of the generator).
