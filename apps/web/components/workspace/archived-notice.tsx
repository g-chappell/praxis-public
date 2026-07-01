'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Read-only state shown when an archived project is opened (STORY-52). An archived
// project is cold storage — no agent, no editing. Restore clears archived_at and
// reloads into the live workspace (the sandbox rebuilds from its snapshot on open).
export function ArchivedNotice({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) throw new Error(String(res.status));
      // Reload: the page re-renders the live workspace and the sandbox rebuilds.
      router.refresh();
      window.location.reload();
    } catch {
      setError('Couldn’t restore the project. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-4 border-2 p-6 text-center shadow-hard">
        <h1 className="text-xl font-semibold tracking-tight">This project is archived</h1>
        <p className="text-sm text-muted-foreground">
          Archived projects are read-only and kept in cold storage — the agent and file editing are
          disabled. Restore it to continue working; your files are intact and the sandbox rebuilds
          when you reopen it.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={restore} disabled={busy}>
            {busy ? 'Restoring…' : 'Restore project'}
          </Button>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
