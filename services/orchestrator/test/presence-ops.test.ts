// Unit tests for presence/cursor logic (STORY-11/TASK-033). Pure functions over
// a SessionRoom — Node-compatible, no Bun/Docker. The live two-browser flow is
// covered by the workspace e2e.

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireLock,
  cursorFrame,
  presenceFrame,
  releaseAbandonedLocks,
  setMemberFile,
} from '../src/presence-ops';
import { createRoom, deleteRoom, getRoom, type RoomMember } from '../src/runtime';

const handle = { projectId: 'p1', containerId: 'c1' };

function room(sessionId: string) {
  createRoom(sessionId, 'p1', handle, 'sk-test');
  return getRoom(sessionId)!;
}

function member(connId: string, over: Partial<RoomMember> = {}): RoomMember {
  return {
    connId,
    userId: `user-${connId}`,
    userName: `User ${connId}`,
    userImage: null,
    ...over,
  };
}

afterEach(() => {
  for (const id of ['s-presence', 's-file', 's-cursor', 's-lock']) deleteRoom(id);
});

describe('presenceFrame', () => {
  it('lists one entry per live connection, with identity + open file', () => {
    const r = room('s-presence');
    r.members.set('a', member('a', { filePath: 'src/App.tsx' }));
    r.members.set('b', member('b'));

    expect(presenceFrame(r)).toEqual({
      type: 'presence',
      members: [
        {
          connId: 'a',
          userId: 'user-a',
          userName: 'User a',
          userImage: null,
          filePath: 'src/App.tsx',
        },
        { connId: 'b', userId: 'user-b', userName: 'User b', userImage: null, filePath: null },
      ],
      locks: [],
    });
  });
});

describe('setMemberFile', () => {
  it('records the open file; a non-string clears it; missing member is a no-op', () => {
    const r = room('s-file');
    r.members.set('a', member('a'));

    setMemberFile(r, 'a', 'index.html');
    expect(r.members.get('a')?.filePath).toBe('index.html');

    setMemberFile(r, 'a', null);
    expect(r.members.get('a')?.filePath).toBeUndefined();

    expect(() => setMemberFile(r, 'ghost', 'x')).not.toThrow();
  });
});

describe('cursorFrame', () => {
  it('stamps the relay with the sender identity', () => {
    const r = room('s-cursor');
    r.members.set('a', member('a'));

    expect(cursorFrame(r, 'a', { filePath: 'src/App.tsx', line: 12, column: 3 })).toEqual({
      type: 'cursor',
      connId: 'a',
      userId: 'user-a',
      userName: 'User a',
      filePath: 'src/App.tsx',
      line: 12,
      column: 3,
    });
  });

  it('returns null for a malformed payload or an unknown sender', () => {
    const r = room('s-cursor');
    r.members.set('a', member('a'));

    expect(cursorFrame(r, 'a', { filePath: 'x', line: 'nope', column: 1 })).toBeNull();
    expect(cursorFrame(r, 'a', { line: 1, column: 1 })).toBeNull();
    expect(cursorFrame(r, 'ghost', { filePath: 'x', line: 1, column: 1 })).toBeNull();
  });
});

describe('file locks', () => {
  it('first writer wins: a simultaneous request for the same free file is denied', () => {
    const r = room('s-lock');
    // Two distinct users race for the same free path; the orchestrator processes
    // them one at a time (synchronous Map ops), so the order is deterministic.
    expect(acquireLock(r, 'user-a', 'index.html')).toBe(true);
    expect(acquireLock(r, 'user-b', 'index.html')).toBe(false);
    expect(r.locks.get('index.html')).toBe('user-a');
  });

  it('re-acquiring your own lock is idempotent', () => {
    const r = room('s-lock');
    expect(acquireLock(r, 'user-a', 'a.ts')).toBe(true);
    expect(acquireLock(r, 'user-a', 'a.ts')).toBe(true);
    expect(r.locks.get('a.ts')).toBe('user-a');
  });

  it('presenceFrame carries the live lock map', () => {
    const r = room('s-lock');
    acquireLock(r, 'user-a', 'a.ts');
    expect(presenceFrame(r).locks).toEqual([{ path: 'a.ts', userId: 'user-a' }]);
  });

  it('releaseAbandonedLocks frees only files the user no longer has open', () => {
    const r = room('s-lock');
    r.members.set('a', member('a', { filePath: 'a.ts' })); // userId user-a, still on a.ts
    acquireLock(r, 'user-a', 'a.ts');
    acquireLock(r, 'user-a', 'old.ts'); // a.ts kept open, old.ts abandoned

    expect(releaseAbandonedLocks(r, 'user-a')).toEqual(['old.ts']);
    expect(r.locks.get('a.ts')).toBe('user-a');
    expect(r.locks.has('old.ts')).toBe(false);
  });

  it('a second tab keeps the lock alive when the first tab moves off', () => {
    const r = room('s-lock');
    // Same user, two connections, both on a.ts.
    r.members.set('tab1', member('tab1', { userId: 'user-a', filePath: 'a.ts' }));
    r.members.set('tab2', member('tab2', { userId: 'user-a', filePath: 'a.ts' }));
    acquireLock(r, 'user-a', 'a.ts');

    // tab1 leaves; tab2 still has a.ts open → lock survives.
    r.members.delete('tab1');
    expect(releaseAbandonedLocks(r, 'user-a')).toEqual([]);
    expect(r.locks.get('a.ts')).toBe('user-a');
  });
});
