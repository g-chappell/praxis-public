// @vitest-environment jsdom
// Client behaviour for presence + locks (STORY-11). Drives the real providers
// with emitted server frames (the orchestrator's relay logic is unit-tested in
// services/orchestrator/test/presence-ops.test.ts) and asserts the roster, lock
// indicators, read-only signal, and outbound messages. The full two-browser
// flow is verified live on the VPS post-deploy.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const subscribers = new Set<(f: Record<string, unknown>) => void>();
const sent: Record<string, unknown>[] = [];
function emit(frame: Record<string, unknown>) {
  act(() => {
    for (const s of subscribers) s(frame);
  });
}
vi.mock('@/components/workspace/workspace-socket', () => ({
  useWorkspaceSocket: () => ({
    status: 'connected',
    start: () => {},
    close: () => {},
    send: (msg: Record<string, unknown>) => {
      sent.push(msg);
      return true;
    },
    subscribe: (fn: (f: Record<string, unknown>) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  }),
}));

import { FileTree } from './file-tree';
import { PresenceBar } from './presence-bar';
import { WorkspaceFilesProvider, useWorkspaceFiles } from './workspace-files';
import {
  type WorkspacePresence,
  WorkspacePresenceProvider,
  useWorkspacePresence,
} from './workspace-presence';

afterEach(() => {
  cleanup();
  subscribers.clear();
  sent.length = 0;
});

let presence: WorkspacePresence | undefined;
let files: ReturnType<typeof useWorkspaceFiles> | undefined;
function Probe() {
  presence = useWorkspacePresence();
  files = useWorkspaceFiles();
  return null;
}

function renderWorkspace() {
  return render(
    <WorkspaceFilesProvider>
      <WorkspacePresenceProvider>
        <Probe />
        <PresenceBar />
        <FileTree />
      </WorkspacePresenceProvider>
    </WorkspaceFilesProvider>,
  );
}

const ME = { connId: 'me', userId: 'u-me', userName: 'Me', userImage: null, filePath: null };
const PEER = {
  connId: 'peer',
  userId: 'u-peer',
  userName: 'Ada',
  userImage: null,
  filePath: 'index.html',
};

describe('presence roster (AC1)', () => {
  it('renders one chip per user with name, tagging this client', () => {
    const { getByText } = renderWorkspace();
    emit({ type: 'ready', connId: 'me' });
    emit({ type: 'presence', members: [ME, PEER], locks: [] });

    expect(getByText('Ada')).toBeTruthy();
    expect(getByText(/\(you\)/)).toBeTruthy();
    expect(presence!.members).toHaveLength(2);
  });
});

describe('peer cursors (TASK-033)', () => {
  it('keeps the latest caret per peer and ignores our own echo', () => {
    renderWorkspace();
    emit({ type: 'ready', connId: 'me' });
    emit({ type: 'presence', members: [ME, PEER], locks: [] });

    emit({
      type: 'cursor',
      connId: 'peer',
      userId: 'u-peer',
      filePath: 'index.html',
      line: 4,
      column: 2,
    });
    emit({
      type: 'cursor',
      connId: 'peer',
      userId: 'u-peer',
      filePath: 'index.html',
      line: 9,
      column: 1,
    });
    emit({
      type: 'cursor',
      connId: 'me',
      userId: 'u-me',
      filePath: 'index.html',
      line: 1,
      column: 1,
    });

    expect(presence!.cursors).toHaveLength(1);
    expect(presence!.cursors[0]).toMatchObject({ connId: 'peer', line: 9, column: 1 });
  });
});

describe('file locks (AC2 / TASK-034)', () => {
  it('a peer-held lock on the open file marks it locked + read-only; the tree shows 🔒', () => {
    const { getByLabelText } = renderWorkspace();
    emit({ type: 'ready', connId: 'me' });
    emit({ type: 'file_tree', paths: ['index.html'] });
    act(() => files!.select('index.html'));

    // Peer Ada now holds the lock on the file we're viewing.
    emit({
      type: 'presence',
      members: [ME, PEER],
      locks: [{ path: 'index.html', userId: 'u-peer' }],
    });

    const owner = presence!.lockOwner('index.html');
    expect(owner?.userName).toBe('Ada'); // read-only signal the editor reads
    expect(getByLabelText('Locked by Ada')).toBeTruthy(); // tree badge
  });

  it('our own lock never makes the file read-only for us', () => {
    renderWorkspace();
    emit({ type: 'ready', connId: 'me' });
    emit({
      type: 'presence',
      members: [ME, PEER],
      locks: [{ path: 'index.html', userId: 'u-me' }],
    });

    expect(presence!.lockOwner('index.html')).toBeNull();
  });
});

describe('outbound messages', () => {
  it('announces the open file to the room on select', () => {
    renderWorkspace();
    emit({ type: 'ready', connId: 'me' });
    emit({ type: 'file_tree', paths: ['index.html'] });
    act(() => files!.select('index.html'));

    expect(sent).toContainEqual({ type: 'file_open', path: 'index.html' });
  });
});
