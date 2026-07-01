// @vitest-environment jsdom
// Turn-gated preview reload (STORY-30 follow-up): the preview holds steady while
// the agent works and reloads ONCE when the turn finishes — only if files changed.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const subscribers = new Set<(f: Record<string, unknown>) => void>();
function emit(frame: Record<string, unknown>) {
  act(() => {
    for (const s of subscribers) s(frame);
  });
}

let previewReady = true;
vi.mock('@/components/workspace/workspace-socket', () => ({
  useWorkspaceSocket: () => ({
    status: 'connected',
    previewUrl: 'https://p.preview.test',
    previewReady,
    subscribe: (fn: (f: Record<string, unknown>) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  }),
}));

import { PreviewPane } from './preview-pane';

afterEach(() => {
  subscribers.clear();
  previewReady = true;
  cleanup();
});

describe('PreviewPane readiness gating (STORY-51)', () => {
  it('does not mount the iframe until the dev server is ready', () => {
    previewReady = false;
    render(<PreviewPane />);
    expect(screen.queryByTitle('Preview')).toBeNull();
    expect(screen.getByText('Starting the preview…')).toBeTruthy();
  });

  it('mounts the iframe once ready', () => {
    previewReady = true;
    render(<PreviewPane />);
    expect(screen.getByTitle('Preview')).toBeTruthy();
  });
});

describe('PreviewPane turn-gated reload', () => {
  it('reloads once when a turn that changed files completes — not mid-turn', () => {
    render(<PreviewPane />);
    const before = screen.getByTitle('Preview');

    // A file changes mid-turn: preview must NOT reload yet.
    emit({ type: 'file_changed', change: 'modify', path: 'src/Scene.tsx' });
    expect(screen.getByTitle('Preview')).toBe(before);

    // Agent finishes the turn → reload once (iframe remounts).
    emit({ type: 'agent_event', event: { type: 'turn-complete' } });
    expect(screen.getByTitle('Preview')).not.toBe(before);
  });

  it('does NOT reload on a turn that changed no files (no spurious flash)', () => {
    render(<PreviewPane />);
    const before = screen.getByTitle('Preview');
    emit({ type: 'agent_event', event: { type: 'turn-complete' } });
    expect(screen.getByTitle('Preview')).toBe(before);
  });

  it('reloads only once per turn (dirty flag resets on completion)', () => {
    render(<PreviewPane />);
    const before = screen.getByTitle('Preview');
    emit({ type: 'file_changed', change: 'modify', path: 'a.ts' });
    emit({ type: 'agent_event', event: { type: 'turn-complete' } });
    const afterFirst = screen.getByTitle('Preview');
    expect(afterFirst).not.toBe(before);
    // A second turn-complete with no new file change → no further reload.
    emit({ type: 'agent_event', event: { type: 'turn-complete' } });
    expect(screen.getByTitle('Preview')).toBe(afterFirst);
  });
});
