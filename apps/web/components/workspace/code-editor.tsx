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

// The editor pane: loads the selected file into Monaco and saves edits back
// through the sandbox. Save is a button and Ctrl/Cmd-S.
export function CodeEditor() {
  const { selectedPath, content, loading, saving, error, save } = useWorkspaceFiles();
  const { resolvedTheme } = useTheme();
  const monacoTheme = resolvedTheme === 'dark' ? 'vs-dark' : 'vs';
  const [draft, setDraft] = useState('');
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  // Keep the latest save in a ref so the Monaco keybinding never goes stale.
  const saveRef = useRef(save);
  saveRef.current = save;

  // When a freshly-read file arrives, replace the draft.
  useEffect(() => {
    if (content !== null) setDraft(content);
  }, [content]);

  if (!selectedPath) {
    return <EditorMessage>Select a file to edit</EditorMessage>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b-2 px-3 py-1.5">
        <span className="truncate font-mono text-xs text-muted-foreground">{selectedPath}</span>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button size="sm" variant="outline" disabled={loading || saving} onClick={() => save(draft)}>
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
              ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                saveRef.current(ed.getValue());
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

function EditorMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
