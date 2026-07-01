// Unit tests for the prompt-control state machine (STORY-34). Node-compatible —
// operates on real in-memory rooms (createRoom) so it exercises the actual room
// mutation the WS handlers drive.

import { afterEach, describe, expect, it } from 'vitest';

import {
  controlStateFrame,
  declineControl,
  grantControl,
  isOwner,
  passControl,
  releaseControl,
  releaseControlOnLeave,
  requestControl,
  setMode,
} from '../src/control';
import { createRoom, deleteRoom } from '../src/runtime';

const handle = { projectId: 'p-ctl', containerId: 'c1' };
const OWNER = 'owner-1';
const OTHER = 'other-1';

function room(sessionId: string, ownerUserId: string | null = OWNER) {
  const r = createRoom(sessionId, 'p-ctl', handle, 'k');
  r.ownerUserId = ownerUserId;
  return r;
}

afterEach(() => {
  for (const s of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) deleteRoom(s);
});

describe('isOwner (STORY-34)', () => {
  it('is true only for the project owner', () => {
    const r = room('c1');
    expect(isOwner(r, OWNER)).toBe(true);
    expect(isOwner(r, OTHER)).toBe(false);
  });
  it('is false when the room has no owner', () => {
    expect(isOwner(room('c2', null), OWNER)).toBe(false);
  });
});

describe('setMode (STORY-34)', () => {
  it('rejects a non-owner', () => {
    const r = room('c1');
    expect(setMode(r, OTHER, 'turn_based')).toEqual({
      ok: false,
      changed: false,
      queueCleared: false,
    });
    expect(r.mode).toBe('serialised'); // unchanged
  });

  it('rejects an unknown mode', () => {
    const r = room('c2');
    expect(setMode(r, OWNER, 'nonsense').ok).toBe(false);
  });

  it('is a no-op when already in the requested mode', () => {
    const r = room('c3');
    expect(setMode(r, OWNER, 'serialised')).toEqual({
      ok: true,
      changed: false,
      queueCleared: false,
    });
  });

  it('switching to turn_based hands control to the owner and clears a non-empty queue', () => {
    const r = room('c4');
    r.queue.push({ id: 'q1', userId: OTHER, author: { name: 'O', image: null }, text: 'hi' });
    r.controlRequests.add(OTHER);
    const result = setMode(r, OWNER, 'turn_based');
    expect(result).toEqual({ ok: true, changed: true, queueCleared: true });
    expect(r.mode).toBe('turn_based');
    expect(r.controlHolder).toBe(OWNER);
    expect(r.queue).toEqual([]);
    expect(r.controlRequests.size).toBe(0);
  });

  it('switching back to serialised vacates control', () => {
    const r = room('c5');
    setMode(r, OWNER, 'turn_based');
    r.controlRequests.add(OTHER);
    const result = setMode(r, OWNER, 'serialised');
    expect(result).toEqual({ ok: true, changed: true, queueCleared: false });
    expect(r.mode).toBe('serialised');
    expect(r.controlHolder).toBeUndefined();
    expect(r.controlRequests.size).toBe(0);
  });
});

describe('turn-based handoff (STORY-34)', () => {
  function turnBased(sessionId: string) {
    const r = room(sessionId);
    setMode(r, OWNER, 'turn_based'); // owner holds control
    return r;
  }

  it('request → holder grants → control transfers', () => {
    const r = turnBased('c1');
    expect(requestControl(r, OTHER).changed).toBe(true);
    expect([...r.controlRequests]).toEqual([OTHER]);
    expect(r.controlHolder).toBe(OWNER); // not yet transferred
    expect(grantControl(r, OWNER, OTHER).changed).toBe(true);
    expect(r.controlHolder).toBe(OTHER);
    expect(r.controlRequests.size).toBe(0);
  });

  it('a non-holder cannot grant', () => {
    const r = turnBased('c2');
    requestControl(r, OTHER);
    expect(grantControl(r, OTHER, OTHER).changed).toBe(false); // OTHER isn't the holder
    expect(r.controlHolder).toBe(OWNER);
  });

  it('holder declines a request → request dropped, holder unchanged', () => {
    const r = turnBased('c3');
    requestControl(r, OTHER);
    expect(declineControl(r, OWNER, OTHER).changed).toBe(true);
    expect(r.controlRequests.has(OTHER)).toBe(false);
    expect(r.controlHolder).toBe(OWNER);
  });

  it('requesting when control is vacant claims it immediately', () => {
    const r = turnBased('c4');
    releaseControl(r, OWNER); // owner is the holder → returns to owner (still OWNER)
    r.controlHolder = undefined; // simulate a fully-vacant hold (holder left)
    expect(requestControl(r, OTHER).changed).toBe(true);
    expect(r.controlHolder).toBe(OTHER); // claimed
  });

  it('release returns control to the owner; pass transfers directly', () => {
    const r = turnBased('c5');
    passControl(r, OWNER, OTHER); // owner passes to OTHER
    expect(r.controlHolder).toBe(OTHER);
    expect(releaseControl(r, OTHER).changed).toBe(true); // OTHER releases
    expect(r.controlHolder).toBe(OWNER); // returns to owner
  });

  it('handoff ops are no-ops in serialised mode', () => {
    const r = room('c6'); // serialised
    expect(requestControl(r, OTHER).changed).toBe(false);
    expect(releaseControl(r, OWNER).changed).toBe(false);
  });
});

describe('releaseControlOnLeave (STORY-34)', () => {
  it('drops the departed user’s queued prompts but keeps others', () => {
    const r = room('c1');
    r.queue.push({ id: 'a', userId: OTHER, author: { name: 'O', image: null }, text: '1' });
    r.queue.push({ id: 'b', userId: OWNER, author: { name: 'W', image: null }, text: '2' });
    expect(releaseControlOnLeave(r, OTHER)).toBe(true);
    expect(r.queue.map((q) => q.id)).toEqual(['b']);
  });

  it('vacates control + drops a pending request when the holder leaves', () => {
    const r = room('c2');
    setMode(r, OWNER, 'turn_based'); // owner holds control
    r.controlRequests.add(OTHER);
    expect(releaseControlOnLeave(r, OWNER)).toBe(true);
    expect(r.controlHolder).toBeUndefined();
    const r2 = room('c3');
    setMode(r2, OWNER, 'turn_based');
    r2.controlRequests.add(OTHER);
    expect(releaseControlOnLeave(r2, OTHER)).toBe(true); // dropped the request
    expect(r2.controlRequests.has(OTHER)).toBe(false);
    expect(r2.controlHolder).toBe(OWNER); // owner still holds
  });

  it('returns false when the departed user had nothing pending', () => {
    expect(releaseControlOnLeave(room('c4'), OTHER)).toBe(false);
  });
});

describe('controlStateFrame (STORY-34)', () => {
  it('reflects mode, owner, holder, requests, and queue', () => {
    const r = room('c6');
    r.queue.push({ id: 'q1', userId: OTHER, author: { name: 'O', image: null }, text: 'do it' });
    expect(controlStateFrame(r)).toEqual({
      type: 'control_state',
      mode: 'serialised',
      ownerUserId: OWNER,
      controlHolder: null,
      requests: [],
      queue: [{ id: 'q1', userId: OTHER, author: { name: 'O', image: null }, text: 'do it' }],
    });
  });
});
