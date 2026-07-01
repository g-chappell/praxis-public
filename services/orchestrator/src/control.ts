// Prompt-control modes (STORY-34): the per-room control state + transitions that
// arbitrate who drives the shared agent. Two modes — 'serialised' (prompts queue
// and run FIFO) and 'turn_based' (one holder at a time, manual handoff). Kept out
// of Bun-coupled ws.ts so the state machine is unit-testable in Node; ws.ts wires
// the WS messages to these helpers and broadcasts the resulting control_state.

import type { SessionRoom } from './runtime';

export type ControlMode = 'serialised' | 'turn_based';

/** A prompt waiting to run in serialised mode, attributed to its author. */
export interface QueuedPrompt {
  id: string;
  userId: string;
  author: { name: string; image: string | null };
  text: string;
}

/** Is this user the project owner — the only one who may change the mode (STORY-34)? */
export function isOwner(room: SessionRoom, userId: string): boolean {
  return room.ownerUserId !== null && room.ownerUserId === userId;
}

/** The control_state frame broadcast to the whole room on any control change, so
 *  every client renders the mode, the holder, pending requests, and the queue. */
export function controlStateFrame(room: SessionRoom): {
  type: 'control_state';
  mode: ControlMode;
  ownerUserId: string | null;
  controlHolder: string | null;
  requests: string[];
  queue: QueuedPrompt[];
} {
  return {
    type: 'control_state',
    mode: room.mode,
    ownerUserId: room.ownerUserId,
    controlHolder: room.controlHolder ?? null,
    requests: [...room.controlRequests],
    queue: room.queue.map((q) => ({ id: q.id, userId: q.userId, author: q.author, text: q.text })),
  };
}

export interface SetModeResult {
  /** false → rejected (not the owner, or an unknown mode). */
  ok: boolean;
  /** true → the mode actually changed; the caller persists it + broadcasts. */
  changed: boolean;
  /** true → switching to turn_based discarded a non-empty serialised queue. */
  queueCleared: boolean;
}

/** Owner-only mode switch (STORY-34). → turn_based clears the serialised queue and
 *  hands control to the owner; → serialised vacates control (the queue takes over).
 *  Mutates the room; returns what the caller should persist/broadcast/notify. */
export function setMode(room: SessionRoom, userId: string, mode: unknown): SetModeResult {
  if (!isOwner(room, userId)) return { ok: false, changed: false, queueCleared: false };
  if (mode !== 'serialised' && mode !== 'turn_based') {
    return { ok: false, changed: false, queueCleared: false };
  }
  if (room.mode === mode) return { ok: true, changed: false, queueCleared: false };

  room.mode = mode;
  room.controlRequests.clear();
  let queueCleared = false;
  if (mode === 'turn_based') {
    queueCleared = room.queue.length > 0;
    room.queue = [];
    room.controlHolder = room.ownerUserId ?? undefined;
  } else {
    // serialised: holder is irrelevant — prompts queue for everyone.
    room.controlHolder = undefined;
  }
  return { ok: true, changed: true, queueCleared };
}

// ─── turn-based handoff (STORY-34) ────────────────────────────────────
// All no-op unless mode is turn_based. Each returns whether the control state
// changed so the caller broadcasts a fresh control_state.

/** A non-holder asks for control. If control is vacant (e.g. the holder
 *  disconnected) the request is granted immediately (a claim); otherwise it's
 *  queued for the holder to approve/decline. */
export function requestControl(room: SessionRoom, userId: string): { changed: boolean } {
  if (room.mode !== 'turn_based' || room.controlHolder === userId) return { changed: false };
  if (room.controlHolder === undefined) {
    room.controlHolder = userId; // vacant → claim
    room.controlRequests.clear();
    return { changed: true };
  }
  if (room.controlRequests.has(userId)) return { changed: false };
  room.controlRequests.add(userId);
  return { changed: true };
}

/** The holder approves a pending request → control transfers to that user. */
export function grantControl(
  room: SessionRoom,
  holderUserId: string,
  targetUserId: unknown,
): { changed: boolean } {
  if (room.mode !== 'turn_based' || room.controlHolder !== holderUserId) return { changed: false };
  if (typeof targetUserId !== 'string' || !room.controlRequests.has(targetUserId)) {
    return { changed: false };
  }
  room.controlHolder = targetUserId;
  room.controlRequests.clear();
  return { changed: true };
}

/** The holder declines a pending request → drop it. */
export function declineControl(
  room: SessionRoom,
  holderUserId: string,
  targetUserId: unknown,
): { changed: boolean } {
  if (room.mode !== 'turn_based' || room.controlHolder !== holderUserId) return { changed: false };
  if (typeof targetUserId !== 'string' || !room.controlRequests.delete(targetUserId)) {
    return { changed: false };
  }
  return { changed: true };
}

/** The holder releases control → it returns to the project owner. */
export function releaseControl(room: SessionRoom, userId: string): { changed: boolean } {
  if (room.mode !== 'turn_based' || room.controlHolder !== userId) return { changed: false };
  room.controlHolder = room.ownerUserId ?? undefined;
  return { changed: true };
}

/** The holder passes control directly to a named user. */
export function passControl(
  room: SessionRoom,
  holderUserId: string,
  targetUserId: unknown,
): { changed: boolean } {
  if (room.mode !== 'turn_based' || room.controlHolder !== holderUserId) return { changed: false };
  if (typeof targetUserId !== 'string' || targetUserId === holderUserId) return { changed: false };
  room.controlHolder = targetUserId;
  room.controlRequests.delete(targetUserId);
  return { changed: true };
}

/** A user fully left the room (STORY-34): drop their queued prompts, drop any
 *  pending control request, and — if they held control in turn-based mode — vacate
 *  it so a remaining user can claim it. Returns true if anything changed (the
 *  caller broadcasts the new control_state). */
export function releaseControlOnLeave(room: SessionRoom, userId: string): boolean {
  let changed = false;
  const before = room.queue.length;
  room.queue = room.queue.filter((q) => q.userId !== userId);
  if (room.queue.length !== before) changed = true;
  if (room.controlRequests.delete(userId)) changed = true;
  if (room.controlHolder === userId) {
    room.controlHolder = undefined; // vacant — a remaining user can claim it
    changed = true;
  }
  return changed;
}
