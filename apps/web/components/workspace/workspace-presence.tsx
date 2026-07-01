'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useWorkspaceFiles } from '@/components/workspace/workspace-files';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// Live presence + cursors over the shared session socket (STORY-11/TASK-033).
// One provider tracks the room roster (who's here, viewing what) and each peer's
// caret, and relays this client's own caret + open file back to the room. Layered
// over WorkspaceFilesProvider so it can observe the open file (selectedPath).

export interface PresenceMember {
  connId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  filePath: string | null;
}

export interface PeerCursor {
  connId: string;
  userId: string;
  userName: string;
  filePath: string;
  line: number;
  column: number;
}

export interface FileLock {
  path: string;
  userId: string;
}

export interface WorkspacePresence {
  /** Full room roster, one entry per live connection (incl. this client). */
  members: PresenceMember[];
  /** This connection's id, or null until the socket is ready. */
  myConnId: string | null;
  /** This client's user id (derived from the roster), or null until known. */
  myUserId: string | null;
  /** Peer carets (this client excluded), the latest per connection. */
  cursors: PeerCursor[];
  /** Soft file locks held across the room (path → owning user). */
  locks: FileLock[];
  /** The owner of a file's lock, or null if free / held by this client. */
  lockOwner: (path: string) => PresenceMember | null;
  /** Relay this client's caret to the room. Throttled (~50ms) internally. */
  sendCursor: (filePath: string, line: number, column: number) => void;
}

const Ctx = createContext<WorkspacePresence | null>(null);

export function useWorkspacePresence(): WorkspacePresence {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspacePresence must be used within <WorkspacePresenceProvider>');
  return ctx;
}

/** Collapse a roster to one entry per user (a user in two tabs appears once),
 *  preferring an entry that has a file open. For presence-list display. */
export function uniqueByUser(members: PresenceMember[]): PresenceMember[] {
  const byUser = new Map<string, PresenceMember>();
  for (const m of members) {
    const existing = byUser.get(m.userId);
    if (!existing || (!existing.filePath && m.filePath)) byUser.set(m.userId, m);
  }
  return [...byUser.values()];
}

const CURSOR_THROTTLE_MS = 50;

function asMembers(value: unknown): PresenceMember[] {
  if (!Array.isArray(value)) return [];
  const out: PresenceMember[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.connId !== 'string' || typeof m.userId !== 'string') continue;
    out.push({
      connId: m.connId,
      userId: m.userId,
      userName: typeof m.userName === 'string' ? m.userName : '',
      userImage: typeof m.userImage === 'string' ? m.userImage : null,
      filePath: typeof m.filePath === 'string' ? m.filePath : null,
    });
  }
  return out;
}

function asLocks(value: unknown): FileLock[] {
  if (!Array.isArray(value)) return [];
  const out: FileLock[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const l = raw as Record<string, unknown>;
    if (typeof l.path === 'string' && typeof l.userId === 'string') {
      out.push({ path: l.path, userId: l.userId });
    }
  }
  return out;
}

export function WorkspacePresenceProvider({ children }: { children: ReactNode }) {
  const { status, send, subscribe } = useWorkspaceSocket();
  const { selectedPath } = useWorkspaceFiles();
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [myConnId, setMyConnId] = useState<string | null>(null);
  const [cursors, setCursors] = useState<PeerCursor[]>([]);
  const [locks, setLocks] = useState<FileLock[]>([]);
  const myConnRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      switch (frame.type) {
        case 'ready': {
          if (typeof frame.connId === 'string') {
            myConnRef.current = frame.connId;
            setMyConnId(frame.connId);
          }
          break;
        }
        case 'presence': {
          const next = asMembers(frame.members);
          setMembers(next);
          setLocks(asLocks(frame.locks));
          // Drop carets for peers no longer in the room.
          const live = new Set(next.map((m) => m.connId));
          setCursors((prev) => prev.filter((c) => live.has(c.connId)));
          break;
        }
        case 'cursor': {
          if (frame.connId === myConnRef.current) break; // never echo our own
          if (
            typeof frame.connId !== 'string' ||
            typeof frame.userId !== 'string' ||
            typeof frame.filePath !== 'string' ||
            typeof frame.line !== 'number' ||
            typeof frame.column !== 'number'
          ) {
            break;
          }
          const cursor: PeerCursor = {
            connId: frame.connId,
            userId: frame.userId,
            userName: typeof frame.userName === 'string' ? frame.userName : '',
            filePath: frame.filePath,
            line: frame.line,
            column: frame.column,
          };
          setCursors((prev) => [...prev.filter((c) => c.connId !== cursor.connId), cursor]);
          break;
        }
      }
    });
  }, [subscribe]);

  // Tell the room which file this client has open (drives the roster + cursor
  // scoping). Re-sent when the open file changes or the socket (re)connects.
  useEffect(() => {
    if (status !== 'connected') return;
    send({ type: 'file_open', path: selectedPath ?? null });
  }, [status, selectedPath, send]);

  // Throttle outbound carets: leading + trailing at ~50ms so fast typing doesn't
  // flood the socket but the peer's caret still tracks smoothly.
  const lastSentRef = useRef(0);
  const pendingRef = useRef<{ filePath: string; line: number; column: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timerRef.current = null;
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    lastSentRef.current = Date.now();
    send({ type: 'cursor', filePath: p.filePath, line: p.line, column: p.column });
  }, [send]);

  const sendCursor = useCallback(
    (filePath: string, line: number, column: number) => {
      pendingRef.current = { filePath, line, column };
      const elapsed = Date.now() - lastSentRef.current;
      if (elapsed >= CURSOR_THROTTLE_MS) {
        flush();
      } else if (!timerRef.current) {
        timerRef.current = setTimeout(flush, CURSOR_THROTTLE_MS - elapsed);
      }
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const myUserId = members.find((m) => m.connId === myConnId)?.userId ?? null;

  // The peer holding a file's lock, or null when it's free or held by us (so a
  // file we locked is never read-only to ourselves).
  const lockOwner = useCallback(
    (path: string): PresenceMember | null => {
      const lock = locks.find((l) => l.path === path);
      if (!lock || lock.userId === myUserId) return null;
      return members.find((m) => m.userId === lock.userId) ?? null;
    },
    [locks, members, myUserId],
  );

  return (
    <Ctx.Provider value={{ members, myConnId, myUserId, cursors, locks, lockOwner, sendCursor }}>
      {children}
    </Ctx.Provider>
  );
}
