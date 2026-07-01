'use client';

import { loader } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { languageFromPath } from '@/components/workspace/file-tree-model';
import { cn } from '@/lib/utils';

// Self-host Monaco assets (ADR-0012); idempotent with the code editor's config.
if (typeof window !== 'undefined') {
  loader.config({ paths: { vs: '/monaco-vs' } });
}

const MonacoDiffEditor = dynamic(() => import('@monaco-editor/react').then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => <Message>Loading diff…</Message>,
});

interface Commit {
  sha: string;
  author: string;
  date: string;
  message: string;
}

interface DiffFile {
  path: string;
  status: string;
  binary: boolean;
  oldContent: string;
  newContent: string;
}

// Git panel (STORY-16/TASK-046): current branch + recent commits, a per-file
// Monaco diff for the selected commit, and a revert-to-commit action guarded by a
// type-the-SHA confirmation. Reads/writes go through the same-origin git proxy
// (/api/projects/:id/git/*). After a revert the sandbox file watcher refreshes
// the editor/file tree over the session socket — we just reload the log here.
export function GitPanel({ projectId }: { projectId: string }) {
  const [branch, setBranch] = useState<string | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [revertTarget, setRevertTarget] = useState<Commit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statusRes, logRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/git/status`),
        fetch(`/api/projects/${projectId}/git/log`),
      ]);
      if (statusRes.status === 409 || logRes.status === 409) {
        setLoadError('Open a session to view git history.');
        setCommits([]);
        return;
      }
      if (!logRes.ok) {
        setLoadError('Could not load git history.');
        return;
      }
      const log = (await logRes.json()) as { commits?: Commit[] };
      const status = statusRes.ok ? ((await statusRes.json()) as { branch?: string }) : null;
      setBranch(status?.branch ?? null);
      setCommits(log.commits ?? []);
    } catch {
      setLoadError('Could not load git history.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b-2 px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground">
          {branch ? (
            <>
              On <span className="font-medium text-foreground">{branch}</span>
            </>
          ) : (
            'Git'
          )}
        </span>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {loadError ? (
        <Message>{loadError}</Message>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-72 shrink-0 overflow-y-auto border-r-2">
            {commits.length === 0 && !loading ? (
              <li className="p-3 text-xs italic text-muted-foreground">No commits yet.</li>
            ) : (
              commits.map((c) => (
                <li key={c.sha}>
                  <button
                    type="button"
                    onClick={() => setSelected(c)}
                    className={cn(
                      'w-full border-b-2 border-l-4 border-l-transparent px-3 py-2 text-left hover:bg-accent',
                      selected?.sha === c.sha && 'border-l-stamp bg-accent',
                    )}
                  >
                    <div className="truncate text-sm">{c.message}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono">{c.sha.slice(0, 7)}</span> · {c.author} ·{' '}
                      {formatDate(c.date)}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selected ? (
              <CommitDiff
                projectId={projectId}
                commit={selected}
                onRevert={() => setRevertTarget(selected)}
              />
            ) : (
              <Message>Select a commit to view its changes.</Message>
            )}
          </div>
        </div>
      )}

      {revertTarget && (
        <RevertModal
          projectId={projectId}
          commit={revertTarget}
          onClose={() => setRevertTarget(null)}
          onDone={() => {
            setRevertTarget(null);
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function CommitDiff({
  projectId,
  commit,
  onRevert,
}: {
  projectId: string;
  commit: Commit;
  onRevert: () => void;
}) {
  const [files, setFiles] = useState<DiffFile[] | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setActivePath(null);
    setError(null);
    (async () => {
      try {
        const qs = `from=${encodeURIComponent(`${commit.sha}~1`)}&to=${encodeURIComponent(commit.sha)}`;
        const res = await fetch(`/api/projects/${projectId}/git/diff?${qs}`);
        if (cancelled) return;
        if (res.status === 422) {
          // No parent — the very first commit. Show the file list without a base.
          setError('No previous version to compare (initial commit).');
          return;
        }
        if (!res.ok) {
          setError('Could not load this commit’s diff.');
          return;
        }
        const data = (await res.json()) as { files?: DiffFile[] };
        if (cancelled) return;
        setFiles(data.files ?? []);
        setActivePath(data.files?.[0]?.path ?? null);
      } catch {
        if (!cancelled) setError('Could not load this commit’s diff.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, commit.sha]);

  const active = files?.find((f) => f.path === activePath) ?? null;

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b-2 px-3 py-1.5">
        <span className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{commit.sha.slice(0, 7)}</span> {commit.message}
        </span>
        <Button size="sm" variant="outline" onClick={onRevert}>
          Revert to this commit
        </Button>
      </div>

      {error ? (
        <Message>{error}</Message>
      ) : !files ? (
        <Message>Loading diff…</Message>
      ) : files.length === 0 ? (
        <Message>No file changes in this commit.</Message>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 border-b-2 px-2 py-1">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => setActivePath(f.path)}
                title={f.path}
                className={cn(
                  'max-w-[16rem] truncate rounded px-2 py-1 text-xs',
                  activePath === f.path
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <span className="mr-1 font-mono">{f.status}</span>
                {f.path.split('/').pop()}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {active?.binary ? (
              <Message>Binary file — no text preview.</Message>
            ) : active ? (
              <MonacoDiffEditor
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
                language={languageFromPath(active.path)}
                original={active.oldContent}
                modified={active.newContent}
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                }}
              />
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

function RevertModal({
  projectId,
  commit,
  onClose,
  onDone,
}: {
  projectId: string;
  commit: Commit;
  onClose: () => void;
  onDone: () => void;
}) {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = commit.sha.slice(0, 7);
  const confirmed = input.trim() === short || input.trim() === commit.sha;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/revert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: commit.sha }),
      });
      if (!res.ok) {
        setError(
          res.status === 409
            ? 'No active session — open the project first.'
            : 'Revert failed. Try again.',
        );
        setPending(false);
        return;
      }
      onDone();
    } catch {
      setError('Revert failed. Try again.');
      setPending(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="w-96 space-y-3 border-2 bg-card p-4 shadow-hard"
      >
        <h2 className="text-sm font-semibold">Revert to commit {short}?</h2>
        <p className="text-xs text-muted-foreground">
          This resets the working tree to{' '}
          <span className="font-medium text-foreground">{commit.message}</span> and{' '}
          <span className="text-destructive">discards commits made after it</span> (recoverable via
          git reflog). Type the short SHA{' '}
          <span className="font-mono font-medium text-foreground">{short}</span> to confirm.
        </p>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={short}
          className="w-full border-2 bg-field px-2 py-1 font-mono text-sm focus-visible:outline-none focus-visible:shadow-hard-stamp"
          aria-label="Confirm commit SHA"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="destructive" disabled={!confirmed || pending}>
            {pending ? 'Reverting…' : 'Revert'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
