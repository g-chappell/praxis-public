'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Admin moderation actions for one project (STORY-44): archive/restore and
// delete, each requiring a typed reason that's recorded in the audit log. The
// reason is captured in an inline panel (no window.prompt) so it's accessible and
// e2e-testable. Calls the admin endpoints; archive refreshes, delete returns to
// the directory.

type Pending = 'archive' | 'delete' | null;

export function AdminProjectActions({
  projectId,
  archived,
}: {
  projectId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (action: Pending) => {
    setPending(action);
    setReason('');
    setError(null);
  };
  const cancel = () => {
    setPending(null);
    setReason('');
    setError(null);
  };

  async function confirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res =
        pending === 'delete'
          ? await fetch(`/api/admin/projects/${projectId}`, {
              method: 'DELETE',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ reason: trimmed }),
            })
          : await fetch(`/api/admin/projects/${projectId}`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ archived: !archived, reason: trimmed }),
            });
      if (!res.ok) {
        setBusy(false);
        setError('That action failed. Try again.');
        return;
      }
      if (pending === 'delete') {
        router.push('/admin/projects');
      } else {
        router.refresh();
      }
      cancel();
    } catch {
      setError('That action failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (pending) {
    return (
      <div className="space-y-2 rounded-md border p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Reason for {pending === 'delete' ? 'deleting' : archived ? 'restoring' : 'archiving'}{' '}
            this project
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            aria-label="Moderation reason"
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            variant={pending === 'delete' ? 'destructive' : 'default'}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? 'Working…' : pending === 'delete' ? 'Delete project' : 'Confirm'}
          </Button>
          <Button variant="outline" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => open('archive')}>
        {archived ? 'Restore' : 'Archive'}
      </Button>
      <Button variant="destructive" onClick={() => open('delete')}>
        Delete
      </Button>
    </div>
  );
}
