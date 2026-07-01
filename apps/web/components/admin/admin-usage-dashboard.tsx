'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminProjectBudget } from '@/components/admin/admin-project-budget';
// Type-only import — keeps the db-client (postgres) out of the browser bundle.
import type { AdminUsageOverview } from '@/lib/admin-usage';

// Admin usage & cost dashboard (STORY-49): a time-window picker, platform totals,
// and top projects / owners by spend, reading GET /api/admin/usage (admin-gated).
// Each top-project row carries the STORY-23 budget cap with an inline setter.

const nf = new Intl.NumberFormat();
const usd = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

const WINDOWS = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: 'all', label: 'All time', days: 0 },
] as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

export function AdminUsageDashboard() {
  const [windowKey, setWindowKey] = useState<(typeof WINDOWS)[number]['key']>('30d');
  const [data, setData] = useState<AdminUsageOverview | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    const win = WINDOWS.find((w) => w.key === windowKey)!;
    const params = new URLSearchParams();
    if (win.days > 0) {
      params.set('from', new Date(Date.now() - win.days * 86_400_000).toISOString());
    }
    fetch(`/api/admin/usage?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((d: AdminUsageOverview) => {
        setData(d);
        setState('ready');
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState('error');
      });
    return () => controller.abort();
  }, [windowKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWindowKey(w.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              windowKey === w.key ? 'bg-accent text-foreground' : 'hover:bg-accent'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {state === 'error' ? (
        <p className="text-sm text-destructive">Couldn’t load usage. Try again.</p>
      ) : state === 'loading' || !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Estimated spend" value={usd.format(data.total.estimatedCostUsd)} />
            <Stat label="Input tokens" value={nf.format(data.total.inputTokens)} />
            <Stat label="Output tokens" value={nf.format(data.total.outputTokens)} />
            <Stat label="Turns" value={nf.format(data.total.turns)} />
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Top projects by spend
            </h2>
            {data.byProject.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage in this window.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Project</th>
                      <th className="px-3 py-2 font-medium">Owner</th>
                      <th className="px-3 py-2 font-medium">Tokens</th>
                      <th className="px-3 py-2 font-medium">Spend</th>
                      <th className="px-3 py-2 font-medium">Budget</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.byProject.map((p) => (
                      <tr key={p.projectId} className="hover:bg-accent/40">
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/projects/${p.projectId}`}
                            className="font-medium hover:underline"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{p.ownerEmail ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {nf.format(p.inputTokens + p.outputTokens)}
                        </td>
                        <td className="px-3 py-2">{usd.format(p.estimatedCostUsd)}</td>
                        <td className="px-3 py-2">
                          <AdminProjectBudget projectId={p.projectId} budgetUsd={p.budgetUsd} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Top users by spend
            </h2>
            <p className="text-xs text-muted-foreground">Attributed to the project owner.</p>
            {data.byUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">No usage in this window.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.byUser.map((u) => (
                  <li
                    key={u.ownerId ?? u.email ?? 'unknown'}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <span>{u.email ?? '—'}</span>
                    <span className="text-muted-foreground">
                      {usd.format(u.estimatedCostUsd)} · {nf.format(u.inputTokens + u.outputTokens)}{' '}
                      tokens
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
