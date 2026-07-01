// Shared session runtime for the orchestrator (STORY-09): the single
// DockerSandbox + AcpHost the whole process uses, plus the in-memory session
// rooms and the one-time WS tickets that authenticate browser connections.
//
// Single-instance POC: rooms + tickets live in memory. A multi-instance
// orchestrator would move these to Redis/Postgres (future).

import { ClaudeAcpHost, type AcpHost, type AgentSession } from '@praxis/acp-host';

import type { ControlMode, QueuedPrompt } from './control';
import {
  DockerSandbox,
  MinioObjectStore,
  type Sandbox,
  type SandboxHandle,
  type Unsubscribe,
} from '@praxis/sandbox';
import type { ServerWebSocket } from 'bun';

let _sandbox: DockerSandbox | undefined;

/** The process-wide DockerSandbox. Built with MinIO persistence when MINIO_* is
 *  configured (else volume-only, ADR-0008). Shared by sessions + the idle sweep. */
export function getSandbox(): DockerSandbox {
  if (!_sandbox) {
    const store = MinioObjectStore.fromEnv() ?? undefined;
    // Sandbox egress allowlist (ADR-0021/STORY-19): when PRAXIS_EGRESS_PROXY_URL
    // is set, sandboxes route HTTP(S) through the allowlist proxy. Paired with
    // PRAXIS_NETWORK pointing at the internal praxis-sandbox-net, anything not
    // allowlisted has no route out. Unset in dev → unrestricted, as before.
    const egressProxyUrl = process.env.PRAXIS_EGRESS_PROXY_URL;
    _sandbox = new DockerSandbox({
      store,
      network: process.env.PRAXIS_NETWORK,
      ...(egressProxyUrl
        ? { egress: { proxyUrl: egressProxyUrl, noProxy: process.env.PRAXIS_EGRESS_NO_PROXY } }
        : {}),
      // Templates ship in the orchestrator image at /app/templates (Dockerfile
      // COPY templates/). Dev sets PRAXIS_TEMPLATES_DIR to the repo templates/.
      templatesDir: process.env.PRAXIS_TEMPLATES_DIR ?? '/app/templates',
    });
  }
  return _sandbox;
}

let _host: ClaudeAcpHost | undefined;

/** The process-wide ACP host (drives the in-sandbox claude-agent-acp adapter). */
export function getAcpHost(): ClaudeAcpHost {
  if (!_host) _host = new ClaudeAcpHost();
  return _host;
}

// ─── session rooms ────────────────────────────────────────────────────
/** A user connected to a room (STORY-11). One per live socket; the same user in
 *  two tabs is two members. `filePath` is the file they currently have open (for
 *  presence "viewing" + cursor scoping), undefined until they open one. */
export interface RoomMember {
  connId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  filePath?: string;
}

export interface SessionRoom {
  sessionId: string;
  projectId: string;
  handle: SandboxHandle;
  // The decrypted platform API key for this session's agent. The web app (Node)
  // decrypts it via @praxis/keys and hands it over the internal POST /sessions
  // call — the orchestrator (Bun) deliberately does NOT load libsodium, which
  // doesn't run under Bun. Held in memory only; never logged.
  apiKey: string;
  // The decrypted platform OpenAI key for this session, when one is configured
  // (STORY-38). Delivered the same way as apiKey (web decrypts, hands it over the
  // internal POST /sessions call). Held in memory only; never logged. Consumed by
  // the image-gen MCP wiring (STORY-15/TASK-044); undefined when no OpenAI key is
  // set — image generation is simply unavailable.
  openaiKey?: string;
  // The project's preview URL at room creation (null if registration failed),
  // returned to every user who joins so re-joiners share the creator's preview
  // without re-registering (STORY-32).
  previewUrl: string | null;
  // The single persistent agent shared by everyone in the room (ADR-0016/STORY-33).
  // Opened lazily on the first prompt, reused across turns and users, re-opened if
  // it dies, and closed on teardown. Undefined until the first prompt.
  agent?: AgentSession;
  // The ACP session id to resume across teardowns (ADR-0017/STORY-36). Seeded from
  // projects.agent_session_id at room creation; updated to the live id after each
  // open. Passed as resumeSessionId so a fresh agent loads the prior conversation.
  agentSessionId?: string;
  sockets: Set<ServerWebSocket<unknown>>;
  // Live presence: connId → member identity (STORY-11/TASK-033). Mutated on WS
  // open/close; broadcast to the room as `presence`.
  members: Map<string, RoomMember>;
  // Soft file locks (STORY-11/TASK-034): project-relative path → owning userId.
  // First writer wins; released when the owner switches file or disconnects.
  locks: Map<string, string>;
  // Stops the per-room sandbox file watcher (started lazily when the first
  // socket joins, STORY-10/TASK-031). Called on teardown so inotifywait in the
  // container is killed. Undefined until the watcher starts.
  unwatchFiles?: Unsubscribe;
  // Pending deferred-teardown timer (STORY-35): set when the last socket leaves,
  // cleared when a socket rejoins within the grace window. Lets a page refresh
  // reconnect to the same live room + agent instead of losing the session.
  teardownTimer?: ReturnType<typeof setTimeout>;
  // Prompt-control state (STORY-34). `mode` + `ownerUserId` are seeded from the
  // project at room creation; `controlHolder` (turn_based), `controlRequests`, and
  // `queue` (serialised) are live, ephemeral session state. See control.ts.
  mode: ControlMode;
  ownerUserId: string | null;
  controlHolder?: string;
  controlRequests: Set<string>;
  queue: QueuedPrompt[];
  // True while the serialised-mode queue is being drained (one turn at a time);
  // prevents concurrent drainers so prompts run strictly FIFO (STORY-34).
  draining?: boolean;
  // Opaque capability token handed to the in-sandbox MCP server (STORY-15). The
  // server presents it to POST /internal/mcp/usage; the orchestrator maps it back
  // to this project to cap usage — so no DB creds ever enter the sandbox.
  mcpToken: string;
  // True once the dev server has answered a readiness probe (STORY-51). The web
  // client holds its loading screen until this is true (broadcast as
  // `workspace_ready`), so the preview is never a 502 on entry. Templates with no
  // dev server are marked ready immediately.
  previewReady: boolean;
}

const rooms = new Map<string, SessionRoom>();
// Reverse index: MCP capability token → sessionId, so the usage endpoint resolves
// a token to its project without scanning every room.
const mcpTokens = new Map<string, string>();

export function createRoom(
  sessionId: string,
  projectId: string,
  handle: SandboxHandle,
  apiKey: string,
  previewUrl: string | null = null,
  openaiKey?: string,
): SessionRoom {
  const room: SessionRoom = {
    sessionId,
    projectId,
    handle,
    apiKey,
    openaiKey,
    previewUrl,
    sockets: new Set(),
    members: new Map(),
    locks: new Map(),
    // Control defaults (STORY-34); createProjectRoom seeds mode + ownerUserId from
    // the project. Default serialised so a room is always in a valid mode.
    mode: 'serialised',
    ownerUserId: null,
    controlRequests: new Set(),
    queue: [],
    mcpToken: crypto.randomUUID(),
    previewReady: false,
  };
  rooms.set(sessionId, room);
  mcpTokens.set(room.mcpToken, sessionId);
  return room;
}

/** Send a frame to every socket currently in a room. Mirrors ws.ts's local
 *  broadcast so non-WS modules (the readiness probe) can push frames too. */
export function broadcastToRoom(room: SessionRoom, payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const sock of room.sockets) sock.send(data);
}

export function getRoom(sessionId: string): SessionRoom | undefined {
  return rooms.get(sessionId);
}

/** Resolve an MCP capability token to its room (STORY-15), or undefined. */
export function getRoomByMcpToken(token: string): SessionRoom | undefined {
  const sessionId = mcpTokens.get(token);
  return sessionId ? rooms.get(sessionId) : undefined;
}

/** The live room for a project, if any (STORY-32). Per-project room reuse keeps
 *  at most one live room per project, so a second user joining attaches here
 *  instead of booting a parallel session — the first match is *the* room. */
export function getRoomByProject(projectId: string): SessionRoom | undefined {
  for (const room of rooms.values()) {
    if (room.projectId === projectId) return room;
  }
  return undefined;
}

/** The outcome of trying to claim the room's shared agent for a new turn. */
export interface TurnAcquire {
  /** ready → use `agent`; busy → a turn is in flight; error → the agent failed to open. */
  status: 'ready' | 'busy' | 'error';
  agent?: AgentSession;
  /** True when a dead agent was just re-opened (the room should be told). */
  restarted: boolean;
  /** A fresh agent was opened this call → persist `room.agentSessionId` (STORY-36). */
  opened: boolean;
  /** A resume was attempted (a prior session id existed) but the agent started
   *  fresh → surface a "couldn't resume earlier conversation" notice. */
  resumeFailed: boolean;
}

/** Claim the room's single persistent agent for a turn (ADR-0016/STORY-33). Opens
 *  it lazily on the first prompt, re-opens it if it died (flagging `restarted`),
 *  and reports `busy` when a turn is already in flight so the caller can reject
 *  rather than race a second turn. On open it resumes the project's prior ACP
 *  session via `resumeSessionId` (ADR-0017/STORY-36), falling back to a fresh
 *  session (flagging `resumeFailed`) when there's no prior id or the load fails.
 *  The opened agent + its live session id are stored on the room. */
export async function acquireRoomTurn(
  room: SessionRoom,
  host: AcpHost,
  sandbox: Sandbox,
): Promise<TurnAcquire> {
  let agent = room.agent;
  let restarted = false;
  let opened = false;
  let resumeFailed = false;
  if (!agent || !agent.alive) {
    restarted = agent !== undefined; // had one before → it died → re-open
    const resumeSessionId = room.agentSessionId;
    try {
      agent = await host.openAgent(sandbox, room.handle, room.apiKey, { resumeSessionId });
    } catch {
      return { status: 'error', restarted: false, opened: false, resumeFailed: false };
    }
    room.agent = agent;
    room.agentSessionId = agent.sessionId; // the live id (resumed or fresh)
    opened = true;
    resumeFailed = resumeSessionId !== undefined && !agent.resumed;
  }
  if (agent.busy) {
    return { status: 'busy', restarted: false, opened: false, resumeFailed: false };
  }
  return { status: 'ready', agent, restarted, opened, resumeFailed };
}

export function deleteRoom(sessionId: string): void {
  const room = rooms.get(sessionId);
  if (room) mcpTokens.delete(room.mcpToken);
  rooms.delete(sessionId);
}

/** Defer a room's teardown by a grace window (STORY-35) instead of ending it the
 *  instant the last socket leaves. `onElapse` runs only if the room is still
 *  empty when the timer fires — a reconnecting socket cancels it via
 *  cancelRoomTeardown, so a page refresh keeps the same live room + agent.
 *  No-op if a teardown is already scheduled. */
export function scheduleRoomTeardown(
  room: SessionRoom,
  graceMs: number,
  onElapse: (sessionId: string) => void,
): void {
  if (room.teardownTimer) return;
  room.teardownTimer = setTimeout(() => {
    room.teardownTimer = undefined;
    if (room.sockets.size === 0) onElapse(room.sessionId);
  }, graceMs);
}

/** Cancel a pending deferred teardown (STORY-35) — called when a socket (re)joins
 *  the room so a brief disconnect/refresh doesn't end the session. */
export function cancelRoomTeardown(room: SessionRoom): void {
  if (room.teardownTimer) {
    clearTimeout(room.teardownTimer);
    room.teardownTimer = undefined;
  }
}

/** Tear down any in-memory rooms for a project (used when it's deleted): stop
 *  each room's file watcher and drop it. The sandbox itself is destroyed
 *  separately by the caller. */
export function purgeProjectRooms(projectId: string): void {
  for (const [sessionId, room] of rooms) {
    if (room.projectId !== projectId) continue;
    room.unwatchFiles?.();
    rooms.delete(sessionId);
  }
}

// ─── one-time WS tickets ──────────────────────────────────────────────
/** The user identity carried by a ticket and stamped onto a room member. Sourced
 *  server-side from the authenticated session (web /api/sessions) — the browser
 *  never asserts its own name/image, so presence can't be spoofed. */
export interface TicketClaim {
  sessionId: string;
  userId: string;
  userName: string;
  userImage: string | null;
}

interface Ticket extends TicketClaim {
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();
const TICKET_TTL_MS = 60_000;

/** Mint a single-use, short-TTL ticket bound to a session + user. The web app
 *  (already authenticated) obtains this and the browser presents it at WS
 *  upgrade — the browser never sends a session cookie cross-subdomain. */
export function mintTicket(claim: TicketClaim): string {
  const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  tickets.set(ticket, { ...claim, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

/** Validate + consume a ticket (single use). Returns the claim or null. */
export function consumeTicket(ticket: string): TicketClaim | null {
  const found = tickets.get(ticket);
  if (!found) return null;
  tickets.delete(ticket);
  if (Date.now() > found.expiresAt) return null;
  return {
    sessionId: found.sessionId,
    userId: found.userId,
    userName: found.userName,
    userImage: found.userImage,
  };
}
