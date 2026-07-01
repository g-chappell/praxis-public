'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

// Manage the email/domain sign-in blocklist (STORY-46): list entries, add one
// (email or domain — inferred from the value, or forced via the toggle), remove
// one. Reads/writes the admin-gated /api/admin/blocklist endpoints.

interface Entry {
  id: string;
  value: string;
  isDomain: boolean;
  reason: string | null;
  createdAt: string | null;
}

export function AdminBlocklistManager() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setState('loading');
    try {
      const res = await fetch('/api/admin/blocklist');
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries: Entry[] };
      setEntries(data.entries);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    const v = value.trim();
    if (!v) {
      setError('Enter an email or domain.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/blocklist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: v, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          b.error === 'already_blocked'
            ? 'That email or domain is already blocked.'
            : b.error === 'invalid_value'
              ? 'Enter a valid email address or domain.'
              : 'Couldn’t add it. Try again.',
        );
        setBusy(false);
        return;
      }
      setValue('');
      setReason('');
      await load();
    } catch {
      setError('Couldn’t add it. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/blocklist/${id}`, { method: 'DELETE' });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-md border p-4">
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">Email or domain</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="spammer@example.com or example.com"
            aria-label="Email or domain to block"
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">Reason (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason"
            className="w-full rounded-md border px-3 py-1.5 text-sm"
          />
        </label>
        <Button onClick={add} disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {state === 'error' ? (
        <p className="text-sm text-destructive">Couldn’t load the blocklist. Try again.</p>
      ) : state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing blocked yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium">{e.value}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {e.isDomain ? 'domain' : 'email'}
                  {e.reason ? ` · ${e.reason}` : ''}
                </span>
              </span>
              <Button variant="outline" onClick={() => remove(e.id)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
