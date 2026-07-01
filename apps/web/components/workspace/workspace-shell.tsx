'use client';

import { type ReactNode, useEffect, useState } from 'react';
import {
  Group,
  type LayoutStorage,
  Panel,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';

import type { ChatAuthor } from '@/components/workspace/chat-message';
import { ChatPanel } from '@/components/workspace/chat-panel';
import { CodeEditor } from '@/components/workspace/code-editor';
import { FileTree } from '@/components/workspace/file-tree';
import { GitPanel } from '@/components/workspace/git-panel';
import { FolderTab } from '@/components/ui/folder-tab';
import { LearningPanel } from '@/components/workspace/learning-panel';
import { ControlBar } from '@/components/workspace/control-bar';
import { PresenceBar } from '@/components/workspace/presence-bar';
import { PreviewPane } from '@/components/workspace/preview-pane';
import { UsagePanel } from '@/components/workspace/usage-panel';
import { cn } from '@/lib/utils';
import { WorkspaceFilesProvider } from '@/components/workspace/workspace-files';
import { WorkspaceControlProvider } from '@/components/workspace/workspace-control';
import { WorkspaceLoadingOverlay } from '@/components/workspace/workspace-loading';
import { WorkspacePresenceProvider } from '@/components/workspace/workspace-presence';
import {
  WorkspaceSocketProvider,
  useWorkspaceSocket,
} from '@/components/workspace/workspace-socket';

// Three-panel workspace shell (STORY-10): file tree | editor | chat, hosted on a
// single shared session socket. Pane sizes persist via `useDefaultLayout` so a
// resize survives a page refresh (TASK-030 acceptance). The file tree and editor
// are empty containers here — their data (sandbox watchFiles + Monaco) lands in
// TASK-031; this task owns only the layout + resizing.

const PANEL_IDS = ['files', 'editor', 'chat'];

// localStorage doesn't exist during Next's SSR of this client component; this
// no-op store keeps useDefaultLayout safe on the server (react-resizable-panels
// otherwise defaults storage to localStorage, which throws server-side).
const layoutStorage: LayoutStorage =
  typeof window === 'undefined' ? { getItem: () => null, setItem: () => {} } : window.localStorage;

export function WorkspaceShell({
  projectId,
  currentUser,
}: {
  projectId: string;
  currentUser: ChatAuthor;
}) {
  return (
    <WorkspaceSocketProvider projectId={projectId}>
      <WorkspaceFilesProvider>
        <WorkspacePresenceProvider>
          <WorkspaceControlProvider>
            <WorkspaceReadyGate>
              <ResizablePanels projectId={projectId} currentUser={currentUser} />
            </WorkspaceReadyGate>
          </WorkspaceControlProvider>
        </WorkspacePresenceProvider>
      </WorkspaceFilesProvider>
    </WorkspaceSocketProvider>
  );
}

// Keep the workspace mounted (so the socket connects, the file list is requested,
// and the readiness probe runs) but cover it with a loading overlay until the
// session is fully ready — connected + files listed + dev server up (STORY-51).
function WorkspaceReadyGate({ children }: { children: ReactNode }) {
  const { ready } = useWorkspaceSocket();
  return (
    <div className="relative h-full">
      {children}
      {!ready && <WorkspaceLoadingOverlay />}
    </div>
  );
}

function ResizablePanels({
  projectId,
  currentUser,
}: {
  projectId: string;
  currentUser: ChatAuthor;
}) {
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'praxis-workspace-panels',
    panelIds: PANEL_IDS,
    storage: layoutStorage,
  });

  // Mount the resizable Group client-side only. It initialises its layout from
  // the persisted sizes at mount, but localStorage isn't readable during SSR —
  // rendering it straight through hydration makes the Group lock in the default
  // sizes and ignore the saved layout, so a resize wouldn't survive a refresh.
  // The static fallback shows the same three columns for the first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex h-full">
        <div className="flex min-w-0 basis-[20%] flex-col">
          <FilesPane />
        </div>
        <div className="w-1 bg-border" />
        <div className="flex min-w-0 basis-[52%] flex-col">
          <EditorPane projectId={projectId} />
        </div>
        <div className="w-1 bg-border" />
        <div className="flex min-w-0 basis-[28%] flex-col">
          <ChatPane currentUser={currentUser} />
        </div>
      </div>
    );
  }

  return (
    <Group
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      className="h-full"
    >
      <Panel id="files" defaultSize="20%" minSize="12%" className="flex min-w-0 flex-col">
        <FilesPane />
      </Panel>

      <ResizeHandle />

      <Panel id="editor" defaultSize="52%" minSize="30%" className="flex min-w-0 flex-col">
        <EditorPane projectId={projectId} />
      </Panel>

      <ResizeHandle />

      <Panel id="chat" defaultSize="28%" minSize="20%" className="flex min-w-0 flex-col">
        <ChatPane currentUser={currentUser} />
      </Panel>
    </Group>
  );
}

function FilesPane() {
  return (
    <>
      <PaneHeader>Files</PaneHeader>
      <PresenceBar />
      <ControlBar />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </>
  );
}

function EditorPane({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<'editor' | 'preview' | 'git' | 'usage'>('editor');
  return (
    <>
      <div className="flex items-end gap-1 border-b-2 px-2 pt-2">
        <FolderTab active={tab === 'editor'} onClick={() => setTab('editor')}>
          Code
        </FolderTab>
        <FolderTab active={tab === 'preview'} onClick={() => setTab('preview')}>
          Preview
        </FolderTab>
        <FolderTab active={tab === 'git'} onClick={() => setTab('git')}>
          Git
        </FolderTab>
        <FolderTab active={tab === 'usage'} onClick={() => setTab('usage')}>
          Usage
        </FolderTab>
      </div>
      {/* Keep editor + preview mounted (hide the inactive one) so the preview's
          running app isn't reloaded on every tab switch. The Git + Usage panels
          mount on demand so they fetch fresh data each time they're opened. */}
      <div className={cn('min-h-0 flex-1', tab !== 'editor' && 'hidden')}>
        <CodeEditor />
      </div>
      <div className={cn('min-h-0 flex-1', tab !== 'preview' && 'hidden')}>
        <PreviewPane />
      </div>
      {tab === 'git' && (
        <div className="relative min-h-0 flex-1">
          <GitPanel projectId={projectId} />
        </div>
      )}
      {tab === 'usage' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <UsagePanel projectId={projectId} />
        </div>
      )}
    </>
  );
}

function ChatPane({ currentUser }: { currentUser: ChatAuthor }) {
  return (
    <>
      <PaneHeader>Chat</PaneHeader>
      <div className="min-h-0 flex-1 p-4">
        <ChatPanel currentUser={currentUser} />
      </div>
      <LearningPanel />
    </>
  );
}

function PaneHeader({ children }: { children: string }) {
  return <div className="label-mono border-b-2 px-3 py-2.5">{children}</div>;
}

function ResizeHandle() {
  return <Separator className="w-0.5 bg-border transition-colors hover:bg-stamp active:bg-stamp" />;
}
