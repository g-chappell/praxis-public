'use client';

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';

import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// Prompt-control modes over the shared session socket (STORY-34). Tracks the
// room's control_state (mode, holder, pending requests, serialised queue) and
// exposes the actions that drive handoff + the mode toggle. Layered alongside
// presence; components resolve user ids → names via the presence roster.

export type ControlMode = 'serialised' | 'turn_based';

export interface QueuedPrompt {
  id: string;
  userId: string;
  author: { name: string; image: string | null };
  text: string;
}

export interface WorkspaceControl {
  mode: ControlMode;
  ownerUserId: string | null;
  controlHolder: string | null;
  requests: string[];
  queue: QueuedPrompt[];
  /** This client's user id (from the ready frame), or null until known. */
  myUserId: string | null;
  /** True when this client is the project owner (may change the mode). */
  isOwner: boolean;
  /** True in turn-based mode when this client holds control. */
  isHolder: boolean;
  /** Whether this client may prompt now: always in serialised, holder-only in turn-based. */
  canPrompt: boolean;
  setMode: (mode: ControlMode) => void;
  requestControl: () => void;
  grantControl: (userId: string) => void;
  declineControl: (userId: string) => void;
  releaseControl: () => void;
  passControl: (userId: string) => void;
  cancelQueued: (id: string) => void;
}

const Ctx = createContext<WorkspaceControl | null>(null);

export function useWorkspaceControl(): WorkspaceControl {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceControl must be used within <WorkspaceControlProvider>');
  return ctx;
}

interface ControlState {
  mode: ControlMode;
  ownerUserId: string | null;
  controlHolder: string | null;
  requests: string[];
  queue: QueuedPrompt[];
}

const INITIAL: ControlState = {
  mode: 'serialised',
  ownerUserId: null,
  controlHolder: null,
  requests: [],
  queue: [],
};

export function WorkspaceControlProvider({ children }: { children: ReactNode }) {
  const { send, subscribe } = useWorkspaceSocket();
  const [state, setState] = useState<ControlState>(INITIAL);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      if (frame.type === 'ready' && typeof frame.userId === 'string') {
        setMyUserId(frame.userId);
      } else if (frame.type === 'control_state') {
        setState({
          mode: frame.mode === 'turn_based' ? 'turn_based' : 'serialised',
          ownerUserId: (frame.ownerUserId as string | null) ?? null,
          controlHolder: (frame.controlHolder as string | null) ?? null,
          requests: Array.isArray(frame.requests) ? (frame.requests as string[]) : [],
          queue: Array.isArray(frame.queue) ? (frame.queue as QueuedPrompt[]) : [],
        });
      }
    });
  }, [subscribe]);

  const isOwner = myUserId !== null && myUserId === state.ownerUserId;
  const isHolder =
    state.mode === 'turn_based' && myUserId !== null && myUserId === state.controlHolder;
  const canPrompt = state.mode === 'serialised' || isHolder;

  const setMode = useCallback((mode: ControlMode) => send({ type: 'set_mode', mode }), [send]);
  const requestControl = useCallback(() => send({ type: 'request_control' }), [send]);
  const grantControl = useCallback(
    (userId: string) => send({ type: 'grant_control', userId }),
    [send],
  );
  const declineControl = useCallback(
    (userId: string) => send({ type: 'decline_control', userId }),
    [send],
  );
  const releaseControl = useCallback(() => send({ type: 'release_control' }), [send]);
  const passControl = useCallback(
    (userId: string) => send({ type: 'pass_control', userId }),
    [send],
  );
  const cancelQueued = useCallback((id: string) => send({ type: 'cancel_queued', id }), [send]);

  return (
    <Ctx.Provider
      value={{
        ...state,
        myUserId,
        isOwner,
        isHolder,
        canPrompt,
        setMode,
        requestControl,
        grantControl,
        declineControl,
        releaseControl,
        passControl,
        cancelQueued,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
