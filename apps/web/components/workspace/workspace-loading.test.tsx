// @vitest-environment jsdom
// Workspace readiness loading overlay (STORY-51): reports the current blocking
// step, and turns terminal non-ready states (connect failed / dropped after being
// live) into actionable cards instead of an eternal spinner.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

let socket: {
  status: string;
  filesLoaded: boolean;
  previewReady: boolean;
  everConnected: boolean;
  start: () => void;
};

vi.mock('@/components/workspace/workspace-socket', () => ({
  useWorkspaceSocket: () => socket,
}));

import { WorkspaceLoadingOverlay } from './workspace-loading';

const base = { filesLoaded: false, previewReady: false, everConnected: false, start: vi.fn() };

afterEach(cleanup);

describe('WorkspaceLoadingOverlay', () => {
  it('shows "Connecting…" while the socket is not yet connected', () => {
    socket = { ...base, status: 'connecting' };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Connecting to your workspace…')).toBeTruthy();
  });

  it('shows "Loading your files…" once connected but before the tree arrives', () => {
    socket = { ...base, status: 'connected', filesLoaded: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Loading your files…')).toBeTruthy();
  });

  it('shows "Starting the preview…" once files are loaded but the dev server is not up', () => {
    socket = { ...base, status: 'connected', filesLoaded: true, previewReady: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Starting the preview…')).toBeTruthy();
  });

  it('shows an error state with actions when the connection failed', () => {
    socket = { ...base, status: 'error' };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Couldn’t start the workspace.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to dashboard' })).toBeTruthy();
  });

  it('shows a reconnect prompt (not a spinner) when dropped after being live', () => {
    socket = { ...base, status: 'idle', everConnected: true };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Disconnected from the session.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to dashboard' })).toBeTruthy();
  });

  it('treats the initial idle (never connected) as connecting, not disconnected', () => {
    socket = { ...base, status: 'idle', everConnected: false };
    render(<WorkspaceLoadingOverlay />);
    expect(screen.getByText('Connecting to your workspace…')).toBeTruthy();
  });
});
