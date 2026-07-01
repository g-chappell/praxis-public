'use client';

import { loader } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { languageFromPath } from '@/components/workspace/file-tree-model';
import { useWorkspaceFiles } from '@/components/workspace/workspace-files';
import { type PeerCursor, useWorkspacePresence } from '@/components/workspace/workspace-presence';

// Self-host the Monaco assets from /monaco-vs instead of the default CDN
// (ADR-0012). Configured once, before the editor loads them.
if (typeof window !== 'undefined') {
  loader.config({ paths: { vs: '/monaco-vs' } });
}

// Monaco needs `window`; load it client-side only.
const MonacoEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.Editor), {
  ssr: false,
  loading: () => <EditorMessage>Loading editor…</EditorMessage>,
});

// The editor pane (TASK-031): loads the selected file into Monaco and saves
// edits back through the sandbox. Save is a button and Ctrl/Cmd-S.
export function CodeEditor() {
  const { selectedPath, content, loading, saving, error, save } = useWorkspaceFiles();
  const { cursors, sendCursor, lockOwner } = useWorkspacePresence();
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';
  const lockedBy = selectedPath ? lockOwner(selectedPath) : null;
  const [draft, setDraft] = useState('');
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  // Keep the latest save in a ref so the Monaco keybinding never goes stale.
  const saveRef = useRef(save);
  saveRef.current = save;
  // The open path + cursor sender, read by the (stable) Monaco listener.
  const selectedRef = useRef(selectedPath);
  selectedRef.current = selectedPath;
  const sendCursorRef = useRef(sendCursor);
  sendCursorRef.current = sendCursor;
  // A peer holds the open file's lock → the editor is read-only for us.
  const readOnly = lockedBy !== null;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  // When a freshly-read file arrives, replace the draft.
  useEffect(() => {
    if (content !== null) setDraft(content);
  }, [content]);

  // Toggle Monaco's read-only state as locks acquire/release without remounting.
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Paint peers' carets for the open file as Monaco decorations. Re-runs as
  // their positions stream in or the open file changes.
  useEffect(() => {
    const collection = decorationsRef.current;
    const monaco = monacoRef.current;
    if (!collection || !monaco) return;
    collection.set(peerDecorations(monaco, cursors, selectedPath));
  }, [cursors, selectedPath, draft]);

  if (!selectedPath) {
    return <EditorMessage>Select a file to edit</EditorMessage>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b-2 px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{selectedPath}</span>
        <div className="flex items-center gap-2">
          {lockedBy && (
            <span className="border-2 border-stamp px-1.5 py-0.5 font-mono text-xs font-bold text-stamp">
              🔒 Locked by {lockedBy.userName}
            </span>
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button
            size="sm"
            variant="outline"
            disabled={loading || saving || lockedBy !== null}
            onClick={() => save(draft)}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {loading ? (
          <EditorMessage>Loading…</EditorMessage>
        ) : (
          <MonacoEditor
            theme={monacoTheme}
            language={languageFromPath(selectedPath)}
            value={draft}
            onChange={(value) => setDraft(value ?? '')}
            onMount={(ed, monaco) => {
              editorRef.current = ed;
              monacoRef.current = monaco;
              decorationsRef.current = ed.createDecorationsCollection();
              ed.updateOptions({ readOnly: readOnlyRef.current });
              ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                if (!readOnlyRef.current) saveRef.current(ed.getValue());
              });
              // Relay this client's caret to the room (throttled in the provider).
              ed.onDidChangeCursorPosition((e) => {
                const path = selectedRef.current;
                if (path) sendCursorRef.current(path, e.position.lineNumber, e.position.column);
              });
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        )}
      </div>
    </div>
  );
}

const PEER_COLORS = 6;

/** Stable colour index (0..5) for a user, so a peer keeps the same colour. */
function colorIndex(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return h % PEER_COLORS;
}

/** Monaco decorations for the peers whose caret is in the open file: a line
 *  marker + an injected name label at the caret column. */
function peerDecorations(
  monaco: Monaco,
  cursors: PeerCursor[],
  selectedPath: string | null,
): editor.IModelDeltaDecoration[] {
  if (!selectedPath) return [];
  const out: editor.IModelDeltaDecoration[] = [];
  for (const c of cursors) {
    if (c.filePath !== selectedPath) continue;
    const idx = colorIndex(c.userId);
    const line = Math.max(1, c.line);
    const column = Math.max(1, c.column);
    out.push({
      range: new monaco.Range(line, column, line, column),
      options: {
        // Injected text renders even for a collapsed range, so the label always
        // shows at the peer's caret column.
        after: {
          content: ` ${c.userName} `,
          inlineClassName: `peer-cursor-label peer-cursor-label${idx}`,
        },
        className: `peer-cursor-line${idx}`,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    });
  }
  return out;
}

function EditorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
