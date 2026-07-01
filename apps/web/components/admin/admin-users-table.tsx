'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Admin users directory (STORY-45): a searchable/sortable table of every user.
// Reads GET /api/admin/users (admin-gated) with ?q/?sort; each row links to the
// user detail.

interface Row {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  bannedAt: string | null;
  createdAt: string | null;
  projectCount: number;
}

type Sort = 'recent' | 'oldest' | 'email';

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export function AdminUsersTable() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    const params = new URLSearchParams({ sort });
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/admin/users?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { users: Row[] }) => {
        setRows(data.users);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [q, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email or name…"
          aria-label="Search users"
          className="min-w-0 flex-1 rounded-md border px-3 py-1.5 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort users"
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="recent">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="email">Email</option>
        </select>
      </div>

      {state === 'error' ? (
        <p className="text-sm text-destructive">Couldn’t load users. Try again.</p>
      ) : state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users match.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Projects</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <Link href={`/admin/users/${r.id}`} className="font-medium hover:underline">
                      {r.email}
                    </Link>
                    {r.name && <span className="ml-2 text-xs text-muted-foreground">{r.name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.role === 'admin' ? (
                      <span className="font-medium">Admin</span>
                    ) : (
                      <span className="text-muted-foreground">User</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.projectCount}</td>
                  <td className="px-3 py-2">
                    {r.bannedAt ? (
                      <span className="text-destructive">Banned</span>
                    ) : (
                      <span className="text-muted-foreground">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
