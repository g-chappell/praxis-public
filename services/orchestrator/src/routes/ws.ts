// GET /ws?ticket=… — the session WebSocket (STORY-09). Browsers authenticate
// with a one-time ticket minted by POST /sessions (the BA cookie isn't sent
// cross-subdomain to api.*). A valid ticket binds the connection to a session
// room; `{type:'prompt'}` drives the agent and streams `agent_event`s back.
// Ping/pong (STORY-05) is preserved.

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';

import { AgentBusyError } from '@praxis/acp-host';
import { projects, sessions } from '@praxis/db';
import { db } from '@praxis/db/client';
import type { FileEvent } from '@praxis/sandbox';

import { loadChatHistory, persistChatEvent } from '../chat-history';
import { applyTurnGitAuthor, commitMessageFromPrompt, commitTurnWork } from '../git-author';
import { projectBudgetStatus, recordTurnUsage } from '../usage';
import {
  controlStateFrame,
  declineControl,
  grantControl,
  passControl,
  releaseControl,
  releaseControlOnLeave,
  requestControl,
  setMode,
  type QueuedPrompt,
} from '../control';

import { handleFileList, handleFileRead, handleFileSave } from '../file-ops';
import {
  acquireLock,
  cursorFrame,
  presenceFrame,
  releaseAbandonedLocks,
  setMemberFile,
} from '../presence-ops';
import { logger } from '../logger';
import { removePreview } from '../preview';
import {
  acquireRoomTurn,
  cancelRoomTeardown,
  consumeTicket,
  deleteRoom,
  getAcpHost,
  getRoom,
  getSandbox,
  scheduleRoomTeardown,
  type SessionRoom,
} from '../runtime';

// How long the room (and its shared agent + sandbox) survives after the last
// socket leaves before tearing down (STORY-35). A page refresh / brief network
// blip reconnects within this window and keeps the live session. Well under the
// 30-min idle sweep, which remains the backstop.
const RECONNECT_GRACE_MS = 90_000;

interface ConnectionState {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  messageCount: number;
}

const conns = new WeakMap<ServerWebSocket<unknown>, ConnectionState>();

function send(ws: { send: (data: string) => void }, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

/** Fan a payload out to every socket currently in the room (file_changed). */
function broadcast(room: SessionRoom | undefined, payload: unknown): void {
  if (!room) return;
  for (const sock of room.sockets) send(sock, payload);
}

/** Fan out to every socket in the room except one (STORY-32) — used to echo a
 *  user's prompt to their peers without double-rendering it for the sender, who
 *  already shows it optimistically. */
function broadcastExcept(
  room: SessionRoom | undefined,
  except: ServerWebSocket<unknown>,
  payload: unknown,
): void {
  if (!room) return;
  for (const sock of room.sockets) if (sock !== except) send(sock, payload);
}

/** Broadcast the room's full presence roster (STORY-11). Sent on join/leave and
 *  whenever a member's open file changes, so every client has the live member
 *  list (avatar + name) and who's viewing what. */
function broadcastPresence(room: SessionRoom | undefined): void {
  if (!room) return;
  broadcast(room, presenceFrame(room));
}

/** Start the per-room sandbox file watcher once (on the first socket join), so
 *  inotify changes in /workspace broadcast to the room as file_changed. */
function ensureWatcher(sessionId: string): void {
  const room = getRoom(sessionId);
  if (!room || room.unwatchFiles) return;
  try {
    room.unwatchFiles = getSandbox().watchFiles(room.handle, (e: FileEvent) => {
      broadcast(getRoom(sessionId), { type: 'file_changed', change: e.type, path: e.path });
    });
  } catch (err) {
    logger.warn(
      { sessionId, err: err instanceof Error ? err.message : String(err) },
      'ws.watch_failed',
    );
  }
}

export const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<unknown>>();

export const wsRoute = new Hono();

wsRoute.get(
  '/',
  upgradeWebSocket((c) => {
    // Consumed once per upgrade (single-use). null → reject in onOpen.
    const claim = consumeTicket(c.req.query('ticket') ?? '');

    return {
      onOpen: (_evt, ws) => {
        if (!claim) {
          send(ws, { type: 'error', reason: 'invalid_ticket' });
          ws.close(4401, 'invalid_ticket');
          return;
        }
        const room = getRoom(claim.sessionId);
        if (!room) {
          send(ws, { type: 'error', reason: 'no_session' });
          ws.close(4404, 'no_session');
          return;
        }
        // A (re)connecting socket cancels any pending grace-window teardown, so a
        // refresh / blip keeps the same live room + agent (STORY-35).
        cancelRoomTeardown(room);
        const id = crypto.randomUUID();
        if (ws.raw) {
          conns.set(ws.raw, {
            id,
            sessionId: claim.sessionId,
            userId: claim.userId,
            userName: claim.userName,
            userImage: claim.userImage,
            messageCount: 0,
          });
          room.sockets.add(ws.raw);
          room.members.set(id, {
            connId: id,
            userId: claim.userId,
            userName: claim.userName,
            userImage: claim.userImage,
          });
        }
        ensureWatcher(claim.sessionId);
        logger.info({ wsConnId: id, sessionId: claim.sessionId }, 'ws.open');
        send(ws, { type: 'ready', sessionId: claim.sessionId, connId: id, userId: claim.userId });
        broadcastPresence(room);
        // Replay the project's full chat transcript to this socket (STORY-37) so a
        // late joiner / re-opener sees the whole conversation, not just new messages.
        void loadChatHistory(room.projectId).then((messages) =>
          send(ws, { type: 'chat_history', messages }),
        );
        // Send the current prompt-control state (mode/holder/queue, STORY-34) so the
        // joiner's control bar + input gating render correctly.
        send(ws, controlStateFrame(room));
        // Tell the joiner whether the dev server is up yet (STORY-51) so a late
        // joiner whose room is already ready doesn't sit on the loading screen.
        send(ws, { type: 'workspace_ready', previewReady: room.previewReady });
      },

      onMessage: async (evt, ws) => {
        const raw = ws.raw;
        const state = raw ? conns.get(raw) : undefined;
        if (!state) return; // never authenticated
        state.messageCount += 1;

        let msg: unknown;
        try {
          msg = JSON.parse(String(evt.data));
        } catch {
          send(ws, { type: 'error', reason: 'invalid_json' });
          return;
        }
        if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
          send(ws, { type: 'error', reason: 'missing_type' });
          return;
        }

        const type = (msg as { type: unknown }).type;
        if (type === 'ping') {
          send(ws, { type: 'pong', ts: Date.now() });
          return;
        }
        if (type === 'prompt') {
          await runPrompt(ws, raw, state, (msg as { text?: unknown }).text);
          return;
        }
        if (type === 'file_list' || type === 'file_read' || type === 'file_save') {
          const room = getRoom(state.sessionId);
          if (!room) {
            send(ws, { type: 'error', reason: 'no_session' });
            return;
          }
          const reply = (payload: unknown) => send(ws, payload);
          const m = msg as { path?: unknown; content?: unknown };
          if (type === 'file_list') await handleFileList(reply, getSandbox(), room.handle);
          else if (type === 'file_read')
            await handleFileRead(reply, getSandbox(), room.handle, m.path);
          else await handleFileSave(reply, getSandbox(), room.handle, m.path, m.content);
          return;
        }
        if (type === 'file_open' || type === 'cursor') {
          handlePresence(ws, state, type, msg);
          return;
        }
        if (type === 'set_mode') {
          handleSetMode(ws, state, (msg as { mode?: unknown }).mode);
          return;
        }
        if (type === 'cancel_queued') {
          handleCancelQueued(state, (msg as { id?: unknown }).id);
          return;
        }
        if (
          type === 'request_control' ||
          type === 'grant_control' ||
          type === 'decline_control' ||
          type === 'release_control' ||
          type === 'pass_control'
        ) {
          handleControl(state, type, msg);
          return;
        }

        send(ws, { type: 'error', reason: 'unknown_type' });
      },

      onClose: (_evt, ws) => {
        const raw = ws.raw;
        const state = raw ? conns.get(raw) : undefined;
        if (!state || !raw) return;
        const room = getRoom(state.sessionId);
        if (room) {
          room.sockets.delete(raw);
          room.members.delete(state.id);
          // Free any file the leaving user held that no other tab still has open.
          releaseAbandonedLocks(room, state.userId);
          // If this user has fully left (no other tab), drop their queued prompts
          // and release any control they held (STORY-34).
          const userGone = ![...room.members.values()].some((m) => m.userId === state.userId);
          if (userGone && releaseControlOnLeave(room, state.userId)) {
            broadcast(room, controlStateFrame(room));
          }
          // Last socket gone → defer teardown by the grace window instead of
          // ending immediately, so a refresh/blip can reconnect to the same live
          // agent (STORY-35). The timer only fires if the room is still empty.
          if (room.sockets.size === 0) scheduleRoomTeardown(room, RECONNECT_GRACE_MS, endSession);
          else broadcastPresence(room);
        }
        logger.info({ wsConnId: state.id, sessionId: state.sessionId }, 'ws.close');
      },
    };
  }),
);

/** Entry point for a `{type:'prompt'}` message (STORY-34). In turn-based mode only
 *  the control holder may prompt; in serialised mode prompts queue and run FIFO. */
async function runPrompt(
  ws: { send: (data: string) => void },
  senderRaw: ServerWebSocket<unknown> | undefined,
  state: ConnectionState,
  text: unknown,
): Promise<void> {
  const room = getRoom(state.sessionId);
  if (!room) {
    send(ws, { type: 'error', reason: 'no_session' });
    return;
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    send(ws, { type: 'error', reason: 'empty_prompt' });
    return;
  }

  const author = { name: state.userName, image: state.userImage };

  // Turn-based gate (STORY-34): only the control holder may prompt. A non-holder's
  // prompt is rejected before it touches the transcript (the client disables their
  // input, so this is a guard). The handoff messages live in handleControl.
  if (room.mode === 'turn_based' && room.controlHolder !== state.userId) {
    send(ws, { type: 'not_in_control', holder: room.controlHolder ?? null });
    return;
  }

  // Budget gate (STORY-23): pause prompting once the project is over budget. No
  // silent drop — the prompter gets an over_budget frame and the prompt isn't
  // accepted. Raising the budget resumes (the status is read fresh each prompt).
  const budget = await projectBudgetStatus(room.projectId);
  if (budget.over) {
    send(ws, { type: 'over_budget', usedUsd: budget.usedUsd, budgetUsd: budget.budgetUsd });
    return;
  }

  const prompt: QueuedPrompt = { id: crypto.randomUUID(), userId: state.userId, author, text };

  // The prompt is accepted into the shared conversation: echo it to peers (the
  // sender renders it optimistically) and persist it to the transcript (STORY-32/37).
  if (senderRaw) broadcastExcept(room, senderRaw, { type: 'user_prompt', text, author });
  await persistChatEvent(room.projectId, room.sessionId, state.userId, 'user_prompt', {
    author,
    text,
  });

  if (room.mode === 'serialised') {
    // Queue + drain FIFO (STORY-34). If a turn is already draining, enqueue and
    // let the active drainer pick it up; otherwise start a drain with this prompt.
    if (room.draining) {
      room.queue.push(prompt);
      broadcast(room, controlStateFrame(room));
    } else {
      void runDrain(room, prompt);
    }
    return;
  }

  // Turn-based: the holder runs one turn at a time (a double-prompt while busy
  // gets agent_busy — no queue in this mode).
  await runAgentTurn(room, prompt, ws);
}

/** Drain the serialised queue (STORY-34): run `first`, then each queued prompt in
 *  FIFO order, one turn at a time. Guarded by room.draining so only one drainer
 *  runs; prompts enqueued mid-drain are picked up before the loop exits. */
async function runDrain(room: SessionRoom, first: QueuedPrompt): Promise<void> {
  room.draining = true;
  let next: QueuedPrompt | undefined = first;
  try {
    while (next) {
      await runAgentTurn(room, next);
      next = room.queue.shift();
      if (next) broadcast(room, controlStateFrame(room)); // queue shrank
    }
  } finally {
    room.draining = false;
  }
}

/** Run one agent turn for an accepted prompt: open/reuse the shared agent, stream
 *  its events to the room (attributed to the prompter), and persist the assembled
 *  agent messages (STORY-33/37). The user prompt was already echoed + persisted by
 *  the caller. Optional `ws` receives agent_busy if the agent is mid-turn. */
async function runAgentTurn(
  room: SessionRoom,
  prompt: QueuedPrompt,
  ws?: { send: (data: string) => void },
): Promise<void> {
  const { userId, author, text } = prompt;
  const turn = await acquireRoomTurn(room, getAcpHost(), getSandbox());
  if (turn.status === 'error') {
    logger.error({ sessionId: room.sessionId }, 'ws.agent_open_failed');
    broadcast(room, {
      type: 'agent_event',
      event: { type: 'error', message: 'Agent error' },
      author,
    });
    return;
  }
  if (turn.status === 'busy') {
    if (ws) send(ws, { type: 'agent_busy' });
    return;
  }
  const agent = turn.agent!;
  if (turn.opened) persistAgentSession(room);
  if (turn.resumeFailed) broadcast(room, { type: 'agent_restarted' });

  // Attribute any commits the agent makes this turn to the prompting user
  // (STORY-17). Non-fatal: a failure just leaves the previous identity in place.
  try {
    await applyTurnGitAuthor(getSandbox(), room.handle, room.projectId, userId);
  } catch (err) {
    logger.warn(
      { sessionId: room.sessionId, err: err instanceof Error ? err.message : String(err) },
      'ws.git_author_failed',
    );
  }

  let pendingText = '';
  const flushText = async (): Promise<void> => {
    if (!pendingText) return;
    await persistChatEvent(room.projectId, room.sessionId, userId, 'agent_text', {
      author,
      text: pendingText,
    });
    pendingText = '';
  };

  try {
    for await (const event of agent.prompt(text, { onPermission: async () => 'allow' })) {
      broadcast(room, { type: 'agent_event', event, author });
      switch (event.type) {
        case 'text-chunk':
          pendingText += event.text;
          break;
        case 'tool-call':
          await flushText();
          await persistChatEvent(room.projectId, room.sessionId, userId, 'tool_call', {
            author,
            title: event.title,
          });
          break;
        case 'file-change':
          await flushText();
          await persistChatEvent(room.projectId, room.sessionId, userId, 'file_change', {
            author,
            change: event.change,
            path: event.path,
          });
          break;
        case 'error':
          await flushText();
          await persistChatEvent(room.projectId, room.sessionId, userId, 'agent_error', {
            author,
            text: event.message,
          });
          break;
        case 'turn-complete':
          await flushText();
          // Meter the turn's token usage (STORY-22). Best-effort.
          if (event.usage) {
            await recordTurnUsage(room.projectId, room.sessionId, event.usage);
          }
          break;
        // tool-result isn't rendered in chat — nothing to persist.
      }
    }
    // Safety-net: commit anything the agent left uncommitted this turn so the git
    // panel reflects the work (STORY-17 AC#1), attributed to the per-turn identity
    // set above and described by the prompt. No-op when the agent already
    // committed. Best-effort.
    try {
      await commitTurnWork(getSandbox(), room.handle, commitMessageFromPrompt(text));
    } catch (err) {
      logger.warn(
        { sessionId: room.sessionId, err: err instanceof Error ? err.message : String(err) },
        'ws.turn_commit_failed',
      );
    }
  } catch (err) {
    if (err instanceof AgentBusyError) {
      if (ws) send(ws, { type: 'agent_busy' });
      return;
    }
    logger.error(
      { sessionId: room.sessionId, err: err instanceof Error ? err.message : String(err) },
      'ws.prompt_failed',
    );
    await flushText();
    broadcast(room, {
      type: 'agent_event',
      event: { type: 'error', message: 'Agent error' },
      author,
    });
    await persistChatEvent(room.projectId, room.sessionId, userId, 'agent_error', {
      author,
      text: 'Agent error',
    });
  }
}

/** Persist the room's live ACP session id onto the project so a later session
 *  resumes this conversation via session/load (ADR-0017/STORY-36). Fire-and-forget
 *  — a failed write just means the next session starts fresh. */
function persistAgentSession(room: SessionRoom): void {
  if (!room.agentSessionId) return;
  void db
    .update(projects)
    .set({ agentSessionId: room.agentSessionId })
    .where(eq(projects.id, room.projectId))
    .catch((err: unknown) =>
      logger.warn(
        { projectId: room.projectId, err: err instanceof Error ? err.message : String(err) },
        'agent_session.persist_failed',
      ),
    );
}

/** Owner-only prompt-control mode switch (STORY-34). Rejects non-owners; on a real
 *  change persists the new mode and broadcasts the updated control_state (plus a
 *  notice when switching to turn-based discarded queued prompts). */
function handleSetMode(
  ws: { send: (data: string) => void },
  state: ConnectionState,
  mode: unknown,
): void {
  const room = getRoom(state.sessionId);
  if (!room) {
    send(ws, { type: 'error', reason: 'no_session' });
    return;
  }
  const result = setMode(room, state.userId, mode);
  if (!result.ok) {
    send(ws, { type: 'error', reason: 'not_owner' });
    return;
  }
  if (!result.changed) return;
  persistControlMode(room);
  if (result.queueCleared) {
    broadcast(room, {
      type: 'system_notice',
      text: 'Switched to turn-based — queued prompts were cleared.',
    });
  }
  broadcast(room, controlStateFrame(room));
}

/** Persist the room's control mode to the project (STORY-34). Fire-and-forget. */
function persistControlMode(room: SessionRoom): void {
  void db
    .update(projects)
    .set({ controlMode: room.mode })
    .where(eq(projects.id, room.projectId))
    .catch((err: unknown) =>
      logger.warn(
        { projectId: room.projectId, err: err instanceof Error ? err.message : String(err) },
        'control_mode.persist_failed',
      ),
    );
}

/** Cancel a queued prompt the requester authored (STORY-34); broadcasts the new
 *  control_state so the queue updates for everyone. Non-authors can't cancel. */
function handleCancelQueued(state: ConnectionState, id: unknown): void {
  const room = getRoom(state.sessionId);
  if (!room || typeof id !== 'string') return;
  const before = room.queue.length;
  room.queue = room.queue.filter((q) => !(q.id === id && q.userId === state.userId));
  if (room.queue.length !== before) broadcast(room, controlStateFrame(room));
}

/** Turn-based control handoff messages (STORY-34): request / grant / decline /
 *  release / pass. Each delegates to the control state machine and broadcasts the
 *  new control_state when it changes; the `requests` it carries drive the holder's
 *  approve/decline UI, so no separate notify is needed. */
function handleControl(
  state: ConnectionState,
  type:
    | 'request_control'
    | 'grant_control'
    | 'decline_control'
    | 'release_control'
    | 'pass_control',
  msg: unknown,
): void {
  const room = getRoom(state.sessionId);
  if (!room) return;
  const target = (msg as { userId?: unknown }).userId;
  let changed = false;
  switch (type) {
    case 'request_control':
      changed = requestControl(room, state.userId).changed;
      break;
    case 'grant_control':
      changed = grantControl(room, state.userId, target).changed;
      break;
    case 'decline_control':
      changed = declineControl(room, state.userId, target).changed;
      break;
    case 'release_control':
      changed = releaseControl(room, state.userId).changed;
      break;
    case 'pass_control':
      changed = passControl(room, state.userId, target).changed;
      break;
  }
  if (changed) broadcast(room, controlStateFrame(room));
}

/** Presence/cursor messages (STORY-11/TASK-033). `file_open` records which file a
 *  member is viewing (drives the roster + cursor scoping); `cursor` relays a live
 *  caret position to the rest of the room, tagged with the sender's identity. */
function handlePresence(
  ws: { send: (data: string) => void },
  state: ConnectionState,
  type: 'file_open' | 'cursor',
  msg: unknown,
): void {
  const room = getRoom(state.sessionId);
  if (!room) {
    send(ws, { type: 'error', reason: 'no_session' });
    return;
  }

  if (type === 'file_open') {
    const path = (msg as { path?: unknown }).path;
    setMemberFile(room, state.id, path);
    // Drop any lock this user no longer has open, then take the new file (soft,
    // first-writer-wins). A failed acquire just means a peer holds it — the
    // client renders read-only off the lock state in the presence frame.
    releaseAbandonedLocks(room, state.userId);
    if (typeof path === 'string') acquireLock(room, state.userId, path);
    broadcastPresence(room);
    return;
  }

  // cursor — relay to peers, stamped with who sent it (null = malformed/gone).
  const frame = cursorFrame(room, state.id, msg);
  if (frame) broadcast(room, frame);
}

// Last client left the room → stop the sandbox (snapshots to MinIO, ADR-0008)
// and mark the session ended. Best-effort; the idle sweep is the backstop.
function endSession(sessionId: string): void {
  const room = getRoom(sessionId);
  if (!room) return;
  room.unwatchFiles?.();
  removePreview(room.projectId); // preview URL revoked → /caddy/ask + proxy 404
  deleteRoom(sessionId);
  void (async () => {
    try {
      // Close the shared agent first so its process dies with the room (ADR-0016),
      // then stop the sandbox. No-op if no prompt ever opened an agent.
      await room.agent?.close();
      await getSandbox().stop(room.handle);
      await db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId));
      logger.info({ sessionId }, 'session.ended');
    } catch (err) {
      logger.warn(
        { sessionId, err: err instanceof Error ? err.message : String(err) },
        'session.end_failed',
      );
    }
  })();
}
