// Presence + cursor logic over the session socket (STORY-11/TASK-033). Kept
// separate from routes/ws.ts so it's unit-testable under Node/Vitest (ws.ts
// imports hono/bun, which only loads under Bun). These are pure functions over a
// SessionRoom: they mutate the in-memory roster and return the frames ws.ts then
// fans out to the room. File locks (TASK-034) extend this module.

import type { SessionRoom } from './runtime';

export interface PresenceFrame {
  type: 'presence';
  members: {
    connId: string;
    userId: string;
    userName: string;
    userImage: string | null;
    filePath: string | null;
  }[];
  // Soft file locks, carried on every roster broadcast so late joiners and
  // post-release clients always converge on the authoritative lock state
  // (STORY-11/TASK-034) — no separate lock-sync message to drift from.
  locks: { path: string; userId: string }[];
}

export interface CursorFrame {
  type: 'cursor';
  connId: string;
  userId: string;
  userName: string;
  filePath: string;
  line: number;
  column: number;
}

/** The room's full presence roster, ready to broadcast. One entry per live
 *  connection (the same user in two tabs is two members). */
export function presenceFrame(room: SessionRoom): PresenceFrame {
  return {
    type: 'presence',
    members: [...room.members.values()].map((m) => ({
      connId: m.connId,
      userId: m.userId,
      userName: m.userName,
      userImage: m.userImage,
      filePath: m.filePath ?? null,
    })),
    locks: [...room.locks].map(([path, userId]) => ({ path, userId })),
  };
}

/** Record which file a member is viewing (drives the roster + cursor scoping).
 *  A non-string path clears it (member is on no file). No-op if the member is
 *  gone. */
export function setMemberFile(room: SessionRoom, connId: string, pathRaw: unknown): void {
  const member = room.members.get(connId);
  if (!member) return;
  member.filePath = typeof pathRaw === 'string' ? pathRaw : undefined;
}

/** Build the relay frame for a cursor message, stamped with the sender's
 *  identity. Returns null if the member is gone or the payload is malformed
 *  (so ws.ts simply drops it). */
export function cursorFrame(room: SessionRoom, connId: string, msg: unknown): CursorFrame | null {
  const member = room.members.get(connId);
  if (!member) return null;
  const m = msg as { filePath?: unknown; line?: unknown; column?: unknown };
  if (
    typeof m.filePath !== 'string' ||
    typeof m.line !== 'number' ||
    typeof m.column !== 'number'
  ) {
    return null;
  }
  return {
    type: 'cursor',
    connId: member.connId,
    userId: member.userId,
    userName: member.userName,
    filePath: m.filePath,
    line: m.line,
    column: m.column,
  };
}

// ─── soft file locks (STORY-11/TASK-034) ──────────────────────────────
// Opening a file takes a soft lock; a peer can still view it but Monaco is
// read-only for them until the owner moves off or disconnects. Locks are keyed
// by userId (the same user in two tabs shares one lock), held in room.locks.

/** Try to lock `path` for `userId`. First writer wins: granted iff the path is
 *  free or already this user's (idempotent). Returns whether the user holds it
 *  after the call. The Map op is synchronous, so concurrent requests for a free
 *  path resolve deterministically — the first one processed wins. */
export function acquireLock(room: SessionRoom, userId: string, path: string): boolean {
  const owner = room.locks.get(path);
  if (owner && owner !== userId) return false;
  room.locks.set(path, userId);
  return true;
}

/** True if any of this user's live members still has `path` open. */
function userViewsPath(room: SessionRoom, userId: string, path: string): boolean {
  for (const m of room.members.values()) {
    if (m.userId === userId && m.filePath === path) return true;
  }
  return false;
}

/** Release every lock this user holds on a file none of their members has open
 *  any more (call after a member switches file or disconnects). Returns the
 *  released paths so ws.ts can broadcast the new state. */
export function releaseAbandonedLocks(room: SessionRoom, userId: string): string[] {
  const released: string[] = [];
  for (const [path, owner] of room.locks) {
    if (owner !== userId) continue;
    if (!userViewsPath(room, userId, path)) {
      room.locks.delete(path);
      released.push(path);
    }
  }
  return released;
}
