import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { ArchivedNotice } from '@/components/workspace/archived-notice';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { getCurrentUser } from '@/lib/current-user';
import { isProjectArchived, userOwnsProject } from '@/lib/projects';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Workspace — Praxis',
};

export default async function ProjectWorkspacePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!(await userOwnsProject(user.id, params.id))) {
    redirect('/dashboard');
  }

  // Archived projects are read-only cold storage: render a restore prompt
  // instead of the live workspace, so the agent + editor never mount.
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
    name: user.name || user.email,
    image: user.image ?? null,
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
