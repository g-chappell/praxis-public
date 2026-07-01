// @vitest-environment jsdom
// Shared-chat attribution (STORY-32 / TASK-086). Drives ChatPanel with emitted
// server frames and asserts that a peer's prompt and the agent stream they
// triggered are attributed to *them*, not to the current user — the multiplayer
// behaviour that replaces the old single-client "always currentUser" assumption.
// The orchestrator's broadcast/echo side is unit-tested in services/orchestrator.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const subscribers = new Set<(f: Record<string, unknown>) => void>();
function emit(frame: Record<string, unknown>) {
  act(() => {
    for (const s of subscribers) s(frame);
  });
}
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/components/workspace/workspace-socket', () => ({
  useWorkspaceSocket: () => ({
    status: 'connected',
    start: () => {},
    close: () => {},
    send: () => true,
    subscribe: (fn: (f: Record<string, unknown>) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  }),
}));

// Default control state for the chat panel: serialised, anyone may prompt, no queue.
vi.mock('@/components/workspace/workspace-control', () => ({
  useWorkspaceControl: () => ({
    mode: 'serialised',
    ownerUserId: null,
    controlHolder: null,
    requests: [],
    queue: [],
    myUserId: null,
    isOwner: false,
    isHolder: false,
    canPrompt: true,
    setMode: () => {},
    requestControl: () => {},
    grantControl: () => {},
    declineControl: () => {},
    releaseControl: () => {},
    passControl: () => {},
    cancelQueued: () => {},
  }),
}));

import { ChatPanel } from './chat-panel';

afterEach(() => {
  cleanup();
  subscribers.clear();
});

describe('ChatPanel shared-chat attribution (STORY-32)', () => {
  it("renders a peer's prompt attributed to the peer, not the current user", () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    emit({
      type: 'user_prompt',
      text: 'add a spinning cube',
      author: { name: 'Ada', image: null },
    });

    expect(screen.getByText('add a spinning cube')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
  });

  it('attributes the agent stream to the prompting user carried on the frame', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    emit({
      type: 'agent_event',
      event: { type: 'text-chunk', text: 'On it — adding the cube.' },
      author: { name: 'Ada', image: null },
    });

    expect(screen.getByText('On it — adding the cube.')).toBeTruthy();
    // Reads as the Assistant, still naming Ada (the prompter).
    expect(screen.getByText('Assistant')).toBeTruthy();
    expect(screen.getByText('· for Ada')).toBeTruthy();
  });

  it('concatenates streamed text chunks into one agent message', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    const author = { name: 'Ada', image: null };
    emit({ type: 'agent_event', event: { type: 'text-chunk', text: 'Hello ' }, author });
    emit({ type: 'agent_event', event: { type: 'text-chunk', text: 'world' }, author });

    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('shows a transient notice on agent_busy without disabling the input (STORY-33)', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    emit({ type: 'agent_busy' });

    expect(screen.getByText(/finishing another turn/i)).toBeTruthy();
    // Input stays live so the user can retry.
    const input = screen.getByPlaceholderText('Message the assistant…') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it('shows the over-budget notice on over_budget without disabling input (STORY-23)', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    emit({ type: 'over_budget', usedUsd: 11, budgetUsd: 10 });

    expect(screen.getByText(/over budget/i)).toBeTruthy();
    expect(screen.getByText(/Usage tab/i)).toBeTruthy();
    const input = screen.getByPlaceholderText('Message the assistant…') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it('shows the restarted notice on agent_restarted (STORY-33)', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    emit({ type: 'agent_restarted' });

    expect(screen.getByText(/agent restarted/i)).toBeTruthy();
    const input = screen.getByPlaceholderText('Message the assistant…') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it('renders the chat_history backfill on join, attributed, before live messages (STORY-37)', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    emit({
      type: 'chat_history',
      messages: [
        { id: 'h1', kind: 'user', author: { name: 'Ada', image: null }, text: 'earlier prompt' },
        { id: 'h2', kind: 'text', author: { name: 'Ada', image: null }, text: 'earlier reply' },
      ],
    });
    expect(screen.getByText('earlier prompt')).toBeTruthy();
    expect(screen.getByText('earlier reply')).toBeTruthy();

    // A live frame after history appends to the transcript.
    emit({ type: 'user_prompt', text: 'new prompt', author: { name: 'Bo', image: null } });
    expect(screen.getByText('new prompt')).toBeTruthy();
  });

  it('applies chat_history only once (idempotent on reconnect)', () => {
    render(<ChatPanel currentUser={{ name: 'Me', image: null }} />);
    const hist = {
      type: 'chat_history',
      messages: [{ id: 'h1', kind: 'user', author: { name: 'Ada', image: null }, text: 'once' }],
    };
    emit(hist);
    emit(hist);
    expect(screen.getAllByText('once')).toHaveLength(1);
  });
});
