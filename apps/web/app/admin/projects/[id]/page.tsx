import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AdminProjectActions } from '@/components/admin/admin-project-actions';
import { AdminProjectBudget } from '@/components/admin/admin-project-budget';
import { adminGetProjectDetail } from '@/lib/admin-projects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin project — Praxis',
};

function fmt(value: Date | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

// Admin project detail (STORY-44): owner, members, recent activity, and the
// archive/delete moderation actions. The admin layout already gates access.
export default async function AdminProjectDetailPage({ params }: { params: { id: string } }) {
  const project = await adminGetProjectDetail(params.id);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-1">
        <Link href="/admin/projects" className="text-xs text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {project.archivedAt ? 'Archived' : 'Active'}
          </span>
        </div>
        {project.description && (
          <p className="text-sm text-muted-foreground">{project.description}</p>
        )}
        <p className="text-sm text-muted-foreground">
          Owner:{' '}
          <span className="font-medium">{project.ownerName ?? project.ownerEmail ?? '—'}</span>
          {project.ownerEmail && project.ownerName ? ` (${project.ownerEmail})` : ''} · Template{' '}
          {project.templateId} · Created {fmt(project.createdAt)}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Members ({project.members.length})
        </h2>
        <ul className="divide-y rounded-md border">
          {project.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{m.name ?? m.email}</span>
              <span className="text-xs text-muted-foreground">joined {fmt(m.joinedAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Recent sessions ({project.recentSessions.length})
        </h2>
        {project.recentSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sessions yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {project.recentSessions.map((s) => (
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
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Moderation
        </h2>
        <AdminProjectActions projectId={project.id} archived={project.archivedAt !== null} />
        <div className="pt-2">
          <AdminProjectBudget projectId={project.id} budgetUsd={project.budgetUsd} />
        </div>
        <Link
          href={`/admin/activity?targetType=project&targetId=${project.id}`}
          className="inline-block text-sm text-muted-foreground hover:underline"
        >
          View activity for this project →
        </Link>
      </section>
    </div>
  );
}
