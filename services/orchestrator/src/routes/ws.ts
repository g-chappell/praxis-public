// GET /ws?ticket=… — the session WebSocket. The browser authenticates with a
// one-time ticket minted by POST /sessions. A valid ticket binds the connection
// to a session room; `{type:'prompt'}` drives the agent and streams
// `agent_event`s back. Ping/pong is preserved.

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
import { handleFileList, handleFileRead, handleFileSave } from '../file-ops';
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

// How long the room (and its agent + sandbox) survives after the last socket
// leaves before tearing down (STORY-35). A page refresh / brief network blip
// reconnects within this window and keeps the live session. Well under the
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

/** Fan a payload out to every socket in the room (e.g. file_changed, agent
 *  events). With one user this is usually one socket, but a second open tab of
 *  the same project shares the room, so keep it a fan-out. */
function broadcast(room: SessionRoom | undefined, payload: unknown): void {
  if (!room) return;
  for (const sock of room.sockets) send(sock, payload);
}

/** Fan out to every socket except one — echoes a prompt to the user's other open
 *  tabs without double-rendering it for the sender, who shows it optimistically. */
function broadcastExcept(
  room: SessionRoom | undefined,
  except: ServerWebSocket<unknown>,
  payload: unknown,
): void {
  if (!room) return;
  for (const sock of room.sockets) if (sock !== except) send(sock, payload);
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
        }
        ensureWatcher(claim.sessionId);
        logger.info({ wsConnId: id, sessionId: claim.sessionId }, 'ws.open');
        send(ws, { type: 'ready', sessionId: claim.sessionId, connId: id, userId: claim.userId });
        // Replay the project's full chat transcript to this socket (STORY-37) so a
        // re-opener sees the whole conversation, not just new messages.
        void loadChatHistory(room.projectId).then((messages) =>
          send(ws, { type: 'chat_history', messages }),
        );
        // Tell the joiner whether the dev server is up yet (STORY-51) so a
        // reconnect to an already-ready room doesn't sit on the loading screen.
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

        send(ws, { type: 'error', reason: 'unknown_type' });
      },

      onClose: (_evt, ws) => {
        const raw = ws.raw;
        const state = raw ? conns.get(raw) : undefined;
        if (!state || !raw) return;
        const room = getRoom(state.sessionId);
        if (room) {
          room.sockets.delete(raw);
          // Last socket gone → defer teardown by the grace window instead of
          // ending immediately, so a refresh/blip can reconnect to the same live
          // agent (STORY-35). The timer only fires if the room is still empty.
          if (room.sockets.size === 0) scheduleRoomTeardown(room, RECONNECT_GRACE_MS, endSession);
        }
        logger.info({ wsConnId: state.id, sessionId: state.sessionId }, 'ws.close');
      },
    };
  }),
);

/** Handle a `{type:'prompt'}` message: echo it to any other open tab, persist it,
 *  then run the agent turn. One user, so prompts run immediately. */
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

  // Accept the prompt into the conversation: echo to any other tab (the sender
  // renders it optimistically) and persist it to the transcript (STORY-37).
  if (senderRaw) broadcastExcept(room, senderRaw, { type: 'user_prompt', text, author });
  await persistChatEvent(room.projectId, room.sessionId, state.userId, 'user_prompt', {
    author,
    text,
  });

  await runAgentTurn(room, { userId: state.userId, author, text }, ws);
}

interface PromptWork {
  userId: string;
  author: { name: string; image: string | null };
  text: string;
}

/** Run one agent turn for an accepted prompt: open/reuse the persistent agent,
 *  stream its events to the room, and persist the assembled agent messages
 *  (STORY-33/37). The user prompt was already echoed + persisted by the caller.
 *  `ws` receives agent_busy if the agent is somehow mid-turn (double prompt). */
async function runAgentTurn(
  room: SessionRoom,
  prompt: PromptWork,
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
          break;
        // tool-result isn't rendered in chat — nothing to persist.
      }
    }
    // Safety-net: commit anything the agent left uncommitted this turn so the git
    // panel reflects the work (STORY-17 AC#1), described by the prompt. No-op when
    // the agent already committed. Best-effort.
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

// Last client left the room → stop the sandbox (snapshots when configured) and
// mark the session ended. Best-effort; the idle sweep is the backstop.
function endSession(sessionId: string): void {
  const room = getRoom(sessionId);
  if (!room) return;
  room.unwatchFiles?.();
  removePreview(room.projectId); // preview URL revoked → proxy 404
  deleteRoom(sessionId);
  void (async () => {
    try {
      // Close the agent first so its process dies with the room (ADR-0016), then
      // stop the sandbox. No-op if no prompt ever opened an agent.
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
