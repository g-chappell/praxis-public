'use client';

import { auditAction } from '@praxis/db';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Enum values come from the client-safe schema export (NOT lib/admin-audit, which
// pulls the db client → postgres into the browser bundle).
const AUDIT_ACTIONS = auditAction.enumValues;

// Audit log viewer (STORY-47): a filterable, paginated table over /api/admin/audit.
// `scoped` carries a deep-link filter from a project/user detail (actor or
// target); the action/time filters + pagination are interactive here.

interface Entry {
  id: string;
  action: string;
  actorUserId: string;
  actorEmail: string | null;
  targetType: string;
  targetId: string;
  createdAt: string | null;
}

const PAGE = 50;

function fmt(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

export function AdminActivityTable({
  scoped,
}: {
  scoped?: { actor?: string; targetType?: string; targetId?: string };
}) {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const scopedActive = Boolean(scoped?.actor || scoped?.targetId);
  const filtersActive = scopedActive || Boolean(action || from || to);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (scoped?.actor) params.set('actor', scoped.actor);
    if (scoped?.targetType) params.set('targetType', scoped.targetType);
    if (scoped?.targetId) params.set('targetId', scoped.targetId);
    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    fetch(`/api/admin/audit?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { entries: Entry[]; total: number }) => {
        setEntries(data.entries);
        setTotal(data.total);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [scoped?.actor, scoped?.targetType, scoped?.targetId, action, from, to, offset]);

  return (
    <div className="space-y-4">
      {scopedActive && (
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {scoped?.actor ? `actor ${scoped.actor.slice(0, 8)}` : null}
            {scoped?.targetId
              ? `${scoped.targetType ?? 'target'} ${scoped.targetId.slice(0, 8)}`
              : null}
          </span>
          <Link href="/admin/activity" className="text-xs text-muted-foreground hover:underline">
            Clear
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={action}
          onChange={(e) => {
            setOffset(0);
            setAction(e.target.value);
          }}
          aria-label="Filter by action"
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label className="text-sm text-muted-foreground">
          From{' '}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setOffset(0);
              setFrom(e.target.value);
            }}
            aria-label="From date"
            className="rounded-md border px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm text-muted-foreground">
          To{' '}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setOffset(0);
              setTo(e.target.value);
            }}
            aria-label="To date"
            className="rounded-md border px-2 py-1 text-sm"
          />
        </label>
      </div>

      {state === 'error' ? (
        <p className="text-sm text-destructive">Couldn’t load activity. Try again.</p>
      ) : state === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtersActive ? 'No entries match these filters.' : 'No activity yet.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Actor</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-accent/40">
                    <td className="px-3 py-2 text-muted-foreground">{fmt(e.createdAt)}</td>
                    <td className="px-3 py-2">{e.actorEmail ?? e.actorUserId.slice(0, 8)}</td>
                    <td className="px-3 py-2 font-medium">{e.action}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.targetType} {e.targetId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {offset + 1}–{offset + entries.length} of {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                disabled={offset === 0}
                className="rounded-md border px-3 py-1 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset(offset + PAGE)}
                disabled={offset + entries.length >= total}
                className="rounded-md border px-3 py-1 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
