'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Role promote/demote for one user (STORY-45). Calls PATCH /api/admin/users/[id];
// the server enforces the self-demotion and last-admin guards — we disable
// self-demotion proactively and surface the guard errors when they come back.

const ERROR_MESSAGE: Record<string, string> = {
  self_demote: 'You can’t remove your own admin role.',
  last_admin: 'You can’t remove the last remaining admin.',
};

export function AdminUserRoleControl({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: 'user' | 'admin';
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextRole = role === 'admin' ? 'user' : 'admin';
  const label = role === 'admin' ? 'Remove admin' : 'Make admin';
  // An admin demoting themselves is blocked server-side; disable it here too.
  const blocked = isSelf && role === 'admin';

  async function change() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_MESSAGE[body.error ?? ''] ?? 'Couldn’t change the role. Try again.');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Couldn’t change the role. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm">
          Role: <span className="font-medium">{role === 'admin' ? 'Admin' : 'User'}</span>
        </span>
        <Button
          variant={role === 'admin' ? 'outline' : 'default'}
          onClick={change}
          disabled={busy || blocked}
        >
          {busy ? 'Working…' : label}
        </Button>
      </div>
      {blocked && (
        <p className="text-xs text-muted-foreground">
          You can’t change your own admin role from here.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
