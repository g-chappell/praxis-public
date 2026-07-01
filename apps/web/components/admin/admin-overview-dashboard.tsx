import Link from 'next/link';

import type { AdminOverview } from '@/lib/admin-overview';

// Live admin landing (STORY-48): stat tiles (users, projects, running sandboxes,
// per-provider key status), recent admin actions, and section links. Pure +
// synchronous (takes the aggregate as a prop) so the server page can render it
// and a component test can exercise it directly. The running-sandboxes tile
// degrades to "Unavailable" when the orchestrator health is absent.

function fmt(value: Date | string | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function Tile({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  return (
    <div className="rounded-lg border p-4">
      {href ? (
        <Link href={href} className="block transition-opacity hover:opacity-70">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

export function AdminOverviewDashboard({ overview }: { overview: AdminOverview }) {
  const { counts, keys, recentActions, orchestrator } = overview;

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Users" value={String(counts.users)} href="/admin/users" />
        <Tile
          label="Projects"
          value={String(counts.projectsActive)}
          hint={`${counts.projectsArchived} archived`}
          href="/admin/projects"
        />
        <Tile
          label="Running sandboxes"
          value={
            orchestrator && orchestrator.runningSandboxes !== null
              ? String(orchestrator.runningSandboxes)
              : 'Unavailable'
          }
          hint={orchestrator ? `gitSha ${orchestrator.gitSha.slice(0, 7)}` : 'orchestrator offline'}
        />
        <Tile
          label="Platform keys"
          value={`${keys.filter((k) => k.configured).length}/${keys.length}`}
          hint="configured"
          href="/admin/api-keys"
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Platform keys
        </h2>
        <ul className="divide-y rounded-md border">
          {keys.map((k) => (
            <li key={k.provider} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="font-medium capitalize">{k.provider}</span>
              <span className="text-xs text-muted-foreground">
                {k.configured
                  ? `${k.maskedKey ?? 'set'} · rotated ${fmt(k.lastRotatedAt)}`
                  : 'Not configured'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recent admin actions
          </h2>
          <Link href="/admin/activity" className="text-sm text-muted-foreground hover:underline">
            View all →
          </Link>
        </div>
        {recentActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admin actions yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {recentActions.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{a.action}</span>{' '}
                  <span className="text-muted-foreground">by {a.actorEmail ?? '—'}</span>
                </span>
                <span className="text-xs text-muted-foreground">{fmt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Sections
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { href: '/admin/projects', label: 'Projects' },
            { href: '/admin/users', label: 'Users' },
            { href: '/admin/blocklist', label: 'Sign-in blocklist' },
            { href: '/admin/activity', label: 'Activity' },
            { href: '/admin/usage', label: 'Usage & cost' },
            { href: '/admin/connectors', label: 'MCP connectors' },
            { href: '/admin/api-keys', label: 'Platform API keys' },
          ].map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-md border px-3 py-1.5 hover:bg-accent"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
