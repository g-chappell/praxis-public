import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { AppNav } from '@/components/app-nav';
import { TeamsPanel } from '@/components/team-card';
import { getAuth } from '@/lib/auth';
import { getTeamsForUser } from '@/lib/teams';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Settings — Praxis',
};

export default async function SettingsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect('/signin');
  }

  const teams = await getTeamsForUser(session.user.id);

  return (
    <>
      <AppNav />
      <main className="flex flex-col items-center px-6 py-12">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Signed in as <span className="font-medium">{session.user.email}</span>.
            </p>
          </div>

          <TeamsPanel teams={teams} />
        </div>
      </main>
    </>
  );
}
