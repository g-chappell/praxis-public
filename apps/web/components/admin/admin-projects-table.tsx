'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Admin projects directory (STORY-44): a searchable/sortable table of EVERY
// project. Reads GET /api/admin/projects (admin-gated) with ?q/?sort/?status so
// search + sort happen server-side; each row links to the project detail.

interface Row {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  memberCount: number;
  archivedAt: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
}

type Sort = 'recent' | 'oldest' | 'name' | 'activity';
type Status = 'all' | 'active' | 'archived';

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

export function AdminProjectsTable() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [status, setStatus] = useState<Status>('all');
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    const params = new URLSearchParams({ sort, status });
    if (q.trim()) params.set('q', q.trim());
    fetch(`/api/admin/projects?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { projects: Row[] }) => {
        setRows(data.projects);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [q, sort, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or owner…"
          aria-label="Search projects"
          className="min-w-0 flex-1 rounded-md border px-3 py-1.5 text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          aria-label="Filter by status"
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort projects"
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="recent">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name">Name</option>
          <option value="activity">Last activity</option>
        </select>
      </div>

      {state === 'error' ? (
        <p className="text-sm text-destructive">Couldn’t load projects. Try again.</p>
      ) : state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects match.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Members</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <Link href={`/admin/projects/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.ownerName ?? r.ownerEmail ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.memberCount}</td>
                  <td className="px-3 py-2">
                    {r.archivedAt ? (
                      <span className="text-muted-foreground">Archived</span>
                    ) : (
                      <span className="text-foreground">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(r.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
