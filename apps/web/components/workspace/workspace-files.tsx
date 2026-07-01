'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';

// Workspace file state (TASK-031), layered over the shared session socket. One
// provider owns the file list + the open file, so the tree (FilesPane) and the
// editor (EditorPane) stay in sync: file_list seeds the tree, file_changed keeps
// it live, file_read opens a file, file_save writes it back.

interface WorkspaceFiles {
  /** Flat, sorted list of project-relative file paths. */
  files: string[];
  /** The file currently open in the editor, or null. */
  selectedPath: string | null;
  /** Contents of the open file; null while a read is in flight. */
  content: string | null;
  /** A file_read for the open file is outstanding. */
  loading: boolean;
  /** A file_save is outstanding. */
  saving: boolean;
  /** A read/save error for the open file, surfaced inline in the editor (the
   *  chat/session is unaffected). Null when the last op succeeded. */
  error: string | null;
  /** Open a file in the editor (requests its contents). */
  select: (path: string) => void;
  /** Persist new contents for the open file. */
  save: (content: string) => void;
}

const Ctx = createContext<WorkspaceFiles | null>(null);

export function useWorkspaceFiles(): WorkspaceFiles {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWorkspaceFiles must be used within <WorkspaceFilesProvider>');
  return ctx;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function WorkspaceFilesProvider({ children }: { children: ReactNode }) {
  const { status, send, subscribe } = useWorkspaceSocket();
  const [files, setFiles] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors selectedPath for the (stable) subscribe closure to match async frames.
  const selectedRef = useRef<string | null>(null);

  // Seed the tree once the socket is live (file_list is dropped if sent early).
  useEffect(() => {
    if (status === 'connected') send({ type: 'file_list' });
  }, [status, send]);

  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      switch (frame.type) {
        case 'file_tree': {
          const paths = Array.isArray(frame.paths)
            ? frame.paths.filter((p): p is string => typeof p === 'string')
            : [];
          setFiles([...paths].sort());
          break;
        }
        case 'file_changed': {
          const path = asString(frame.path);
          if (!path) break;
          if (frame.change === 'create') {
            setFiles((prev) => (prev.includes(path) ? prev : [...prev, path].sort()));
          } else if (frame.change === 'delete') {
            setFiles((prev) => prev.filter((p) => p !== path));
          }
          break;
        }
        case 'file_contents': {
          if (frame.path === selectedRef.current) {
            setContent(asString(frame.content) ?? '');
            setLoading(false);
            setError(null);
          }
          break;
        }
        case 'file_saved': {
          if (frame.path === selectedRef.current) {
            setSaving(false);
            setError(null);
          }
          break;
        }
        case 'error': {
          // A file-scoped error (carries a `path`) is surfaced inline in the
          // editor — NOT as a chat/session error. Clear the in-flight flags.
          if (frame.path && frame.path === selectedRef.current) {
            setLoading(false);
            setSaving(false);
            setError(
              frame.reason === 'read_failed'
                ? 'Could not load this file.'
                : 'Could not save — try again.',
            );
          }
          break;
        }
      }
    });
  }, [subscribe]);

  const select = useCallback(
    (path: string) => {
      selectedRef.current = path;
      setSelectedPath(path);
      setContent(null);
      setError(null);
      setLoading(true);
      send({ type: 'file_read', path });
    },
    [send],
  );

  const save = useCallback(
    (body: string) => {
      const path = selectedRef.current;
      if (!path) return;
      setError(null);
      setSaving(true);
      setContent(body);
      send({ type: 'file_save', path, content: body });
    },
    [send],
  );

  return (
    <Ctx.Provider value={{ files, selectedPath, content, loading, saving, error, select, save }}>
      {children}
    </Ctx.Provider>
  );
}
