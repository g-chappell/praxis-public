import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { ArchivedNotice } from '@/components/workspace/archived-notice';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { getAuth } from '@/lib/auth';
import { isProjectArchived, userOwnsProject } from '@/lib/projects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Workspace — Praxis',
};

export default async function ProjectWorkspacePage({ params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/signin');
  }
  // Canonical ownership guard (middleware only checks cookie presence).
  if (!(await userOwnsProject(session.user.id, params.id))) {
    redirect('/dashboard');
  }

  // Archived projects are read-only cold storage (STORY-52): render a restore
  // prompt instead of the live workspace, so the agent + editor never mount.
  if (await isProjectArchived(params.id)) {
    return (
      <div className="flex h-screen flex-col">
        <AppNav />
        <main className="min-h-0 flex-1">
          <ArchivedNotice projectId={params.id} />
        </main>
      </div>
    );
  }

  const currentUser = {
    // `||` (not `??`): a user with no display name has name = '' (empty), which
    // should still fall back to the email.
    name: session.user.name || session.user.email,
    image: session.user.image ?? null,
  };

  return (
    <div className="flex h-screen flex-col">
      <AppNav />
      <main className="min-h-0 flex-1">
        <WorkspaceShell projectId={params.id} currentUser={currentUser} />
      </main>
    </div>
  );
}
