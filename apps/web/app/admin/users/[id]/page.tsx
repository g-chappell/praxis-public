import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminUserBanControl } from '@/components/admin/admin-user-ban-control';
import { AdminUserRoleControl } from '@/components/admin/admin-user-role-control';
import { adminGetUser } from '@/lib/admin-users';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin user — Praxis',
};

function fmt(value: Date | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

// Admin user detail (STORY-45): profile, role control (guarded), projects,
// recent sessions, and recent audited activity. The admin layout gates access.
export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const [user, session] = await Promise.all([
    adminGetUser(params.id),
    getAuth().api.getSession({ headers: await headers() }),
  ]);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-1">
        <Link href="/admin/users" className="text-xs text-muted-foreground hover:underline">
          ← Users
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{user.name ?? user.email}</h1>
          {user.bannedAt && (
            <span className="rounded-full border px-2 py-0.5 text-xs text-destructive">Banned</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {user.email} · Joined {fmt(user.createdAt)}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Role</h2>
        <AdminUserRoleControl
          userId={user.id}
          role={user.role}
          isSelf={user.id === session?.user.id}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Access
        </h2>
        <AdminUserBanControl
          userId={user.id}
          banned={user.bannedAt !== null}
          isSelf={user.id === session?.user.id}
        />
        {user.bannedAt && user.banReason && (
          <p className="text-xs text-muted-foreground">Reason: {user.banReason}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Projects ({user.projects.length})
        </h2>
        {user.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {user.projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link href={`/admin/projects/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {p.teamName}
                  {p.archivedAt ? ' · archived' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Recent sessions ({user.recentSessions.length})
        </h2>
        {user.recentSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {user.recentSessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-muted-foreground">Started {fmt(s.startedAt)}</span>
                <span className="text-xs text-muted-foreground">
                  {s.endedAt ? `ended ${fmt(s.endedAt)}` : 'active'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recent activity ({user.recentActivity.length})
          </h2>
          <Link
            href={`/admin/activity?actor=${user.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            View all →
          </Link>
        </div>
        {user.recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audited activity.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {user.recentActivity.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{a.action}</span>{' '}
                  <span className="text-muted-foreground">
                    {a.targetType} {a.targetId.slice(0, 8)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">{fmt(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
