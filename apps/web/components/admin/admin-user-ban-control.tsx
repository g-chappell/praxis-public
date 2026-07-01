'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Ban / unban control for one user (STORY-46). Banning captures a required reason
// in an inline panel; the server enforces self-ban and last-admin guards, which
// we surface. Self-ban is also disabled proactively.

const ERROR_MESSAGE: Record<string, string> = {
  self_ban: 'You can’t ban yourself.',
  last_admin: 'You can’t ban the last remaining admin.',
  reason_required: 'A reason is required.',
};

export function AdminUserBanControl({
  userId,
  banned,
  isSelf,
}: {
  userId: string;
  banned: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { banned: boolean; reason?: string }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_MESSAGE[b.error ?? ''] ?? 'That action failed. Try again.');
        setBusy(false);
        return;
      }
      setOpen(false);
      setReason('');
      router.refresh();
    } catch {
      setError('That action failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (banned) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-destructive">Banned</span>
          <Button variant="outline" onClick={() => send({ banned: false })} disabled={busy}>
            {busy ? 'Working…' : 'Unban'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  if (open) {
    return (
      <div className="space-y-2 rounded-md border p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Reason for banning this user</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            aria-label="Ban reason"
            className="w-full rounded-md border px-3 py-1.5 text-sm"
            autoFocus
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={() => {
              if (!reason.trim()) {
                setError('A reason is required.');
                return;
              }
              void send({ banned: true, reason: reason.trim() });
            }}
            disabled={busy}
          >
            {busy ? 'Working…' : 'Ban user'}
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button variant="destructive" onClick={() => setOpen(true)} disabled={isSelf}>
        Ban
      </Button>
      {isSelf && <p className="text-xs text-muted-foreground">You can’t ban yourself.</p>}
    </div>
  );
}
