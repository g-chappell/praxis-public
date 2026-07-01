import Link from 'next/link';

import { AppNav } from '@/components/app-nav';
import { CreateProjectForm } from '@/components/create-project-form';
import { ProjectList } from '@/components/project-list';
import { getCurrentUser } from '@/lib/current-user';
import { listUserProjects, parseProjectStatus } from '@/lib/projects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Dashboard — Praxis',
};

const TABS = [
  { status: 'active' as const, label: 'Active', href: '/dashboard' },
  { status: 'archived' as const, label: 'Archived', href: '/dashboard?status=archived' },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await getCurrentUser();

  // The UI only toggles Active vs Archived (never 'all'); parseProjectStatus
  // defaults anything unexpected to active.
  const raw = parseProjectStatus(searchParams.status);
  const status = raw === 'archived' ? 'archived' : 'active';
  const projects = await listUserProjects(user.id, { status });

  return (
    <>
      <AppNav />
      <main className="mx-auto w-full max-w-4xl px-6 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your projects</h1>
            <p className="mt-1 italic text-muted-foreground">
              Open one to resume, or start a new one.
            </p>
          </div>
          <CreateProjectForm />
        </div>

        <div className="mb-5 flex gap-1 border-b-2" role="tablist">
          {TABS.map((tab) => {
            const active = tab.status === status;
            return (
              <Link
                key={tab.status}
                href={tab.href}
                role="tab"
                aria-selected={active}
                data-testid={`tab-${tab.status}`}
                className={
                  active
                    ? 'label-mono -mb-0.5 border-b-2 border-stamp px-3 py-2 text-foreground'
                    : 'label-mono -mb-0.5 border-b-2 border-transparent px-3 py-2 hover:text-foreground'
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <ProjectList projects={projects} status={status} />
      </main>
    </>
  );
}
