'use client';

import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// Full-pane overlay shown until the workspace is fully ready (STORY-51): the
// session socket is connected, the file tree has arrived, and the dev server is
// serving the preview. Sits on top of the (already-mounted) workspace so the
// socket connects and the file list / readiness probe run behind it — the user
// just doesn't see a half-built workspace (empty files, 502 preview) on entry.
//
// It also covers the non-ready terminal states so they aren't an eternal spinner:
// a failed connect, or a session that dropped/ended after being live, offer a way
// out (reconnect / back to dashboard) instead of spinning forever.

function Spinner() {
  return (
    <svg
      className="h-6 w-6 animate-spin text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
      {children}
    </div>
  );
}

export function WorkspaceLoadingOverlay() {
  const { status, filesLoaded, previewReady, everConnected, start } = useWorkspaceSocket();
  const router = useRouter();

  // Connect failed after retries — not recoverable by waiting.
  if (status === 'error') {
    return (
      <Overlay>
        <p className="text-sm font-medium text-foreground">Couldn’t start the workspace.</p>
        <div className="flex gap-2">
          <Button onClick={() => start()}>Try again</Button>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </Overlay>
    );
  }

  // Dropped/ended after being live (status fell back to idle). Don't pretend to be
  // "connecting" forever — offer a reconnect or an exit.
  if (status === 'idle' && everConnected) {
    return (
      <Overlay>
        <p className="text-sm font-medium text-foreground">Disconnected from the session.</p>
        <div className="flex gap-2">
          <Button onClick={() => start()}>Reconnect</Button>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </Overlay>
    );
  }

  // Still coming up: connecting, or connected but files/preview not ready yet.
  const message =
    status !== 'connected'
      ? 'Connecting to your workspace…'
      : !filesLoaded
        ? 'Loading your files…'
        : !previewReady
          ? 'Starting the preview…'
          : 'Almost ready…';

  return (
    <Overlay>
      <Spinner />
      <p className="text-sm text-muted-foreground">{message}</p>
    </Overlay>
  );
}
