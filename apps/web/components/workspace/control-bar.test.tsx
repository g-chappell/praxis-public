// @vitest-environment jsdom
// ControlBar + PromptQueue rendering & action wiring (STORY-34/TASK-094/095). The
// control + presence hooks are mocked so each test states the control state it
// exercises; the full live handoff is verified on the deployed app.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const control = {
  mode: 'serialised',
  ownerUserId: 'owner',
  controlHolder: null as string | null,
  requests: [] as string[],
  queue: [] as Array<{
    id: string;
    userId: string;
    author: { name: string; image: null };
    text: string;
  }>,
  myUserId: 'owner',
  isOwner: true,
  isHolder: false,
  canPrompt: true,
  setMode: vi.fn(),
  requestControl: vi.fn(),
  grantControl: vi.fn(),
  declineControl: vi.fn(),
  releaseControl: vi.fn(),
  passControl: vi.fn(),
  cancelQueued: vi.fn(),
};

let members: Array<{
  connId: string;
  userId: string;
  userName: string;
  userImage: null;
  filePath: null;
}> = [];

vi.mock('@/components/workspace/workspace-control', () => ({
  useWorkspaceControl: () => control,
}));
vi.mock('@/components/workspace/workspace-presence', () => ({
  useWorkspacePresence: () => ({ members }),
  uniqueByUser: (m: typeof members) => m,
}));

import { ControlBar } from './control-bar';
import { PromptQueue } from './prompt-queue';

function reset(over: Partial<typeof control> = {}) {
  Object.assign(control, {
    mode: 'serialised',
    controlHolder: null,
    requests: [],
    queue: [],
    myUserId: 'owner',
    isOwner: true,
    isHolder: false,
    canPrompt: true,
  });
  for (const fn of [
    control.setMode,
    control.requestControl,
    control.grantControl,
    control.releaseControl,
    control.cancelQueued,
  ])
    (fn as ReturnType<typeof vi.fn>).mockClear();
  Object.assign(control, over);
}

afterEach(cleanup);

describe('ControlBar (STORY-34)', () => {
  it('owner sees an editable mode toggle; clicking switches mode', () => {
    reset({ isOwner: true });
    members = [
      { connId: 'c', userId: 'owner', userName: 'Owner', userImage: null, filePath: null },
    ];
    render(<ControlBar />);
    fireEvent.click(screen.getByText('Take turns'));
    expect(control.setMode).toHaveBeenCalledWith('turn_based');
  });

  it('non-owner sees the mode read-only (no toggle buttons)', () => {
    reset({ isOwner: false, mode: 'turn_based', controlHolder: 'owner', myUserId: 'guest' });
    members = [
      { connId: 'c1', userId: 'owner', userName: 'Owner', userImage: null, filePath: null },
      { connId: 'c2', userId: 'guest', userName: 'Guest', userImage: null, filePath: null },
    ];
    render(<ControlBar />);
    expect(screen.queryByRole('button', { name: 'Serialised' })).toBeNull();
    // A non-holder sees who has control + a Request control button.
    expect(screen.getByText(/Owner has control/)).toBeTruthy();
    fireEvent.click(screen.getByText('Request control'));
    expect(control.requestControl).toHaveBeenCalled();
  });

  it('the holder sees Release + a pending request to approve', () => {
    reset({ mode: 'turn_based', isHolder: true, controlHolder: 'owner', requests: ['guest'] });
    members = [
      { connId: 'c1', userId: 'owner', userName: 'Owner', userImage: null, filePath: null },
      { connId: 'c2', userId: 'guest', userName: 'Guest', userImage: null, filePath: null },
    ];
    render(<ControlBar />);
    expect(screen.getByText('You have control')).toBeTruthy();
    expect(screen.getByText(/Guest wants control/)).toBeTruthy();
    fireEvent.click(screen.getByText('Approve'));
    expect(control.grantControl).toHaveBeenCalledWith('guest');
    fireEvent.click(screen.getByText('Release'));
    expect(control.releaseControl).toHaveBeenCalled();
  });
});

describe('PromptQueue (STORY-34)', () => {
  it('shows queued prompts; only the author gets a Cancel button', () => {
    reset({
      mode: 'serialised',
      myUserId: 'me',
      queue: [
        { id: 'q1', userId: 'me', author: { name: 'Me', image: null }, text: 'mine' },
        { id: 'q2', userId: 'other', author: { name: 'Other', image: null }, text: 'theirs' },
      ],
    });
    render(<PromptQueue />);
    expect(screen.getByText('mine')).toBeTruthy();
    expect(screen.getByText('theirs')).toBeTruthy();
    // One Cancel button (only the author's own entry).
    const cancels = screen.getAllByText('Cancel');
    expect(cancels).toHaveLength(1);
    fireEvent.click(cancels[0]!);
    expect(control.cancelQueued).toHaveBeenCalledWith('q1');
  });

  it('renders nothing in turn-based mode', () => {
    reset({
      mode: 'turn_based',
      queue: [{ id: 'q', userId: 'me', author: { name: 'M', image: null }, text: 'x' }],
    });
    const { container } = render(<PromptQueue />);
    expect(container.firstChild).toBeNull();
  });
});
