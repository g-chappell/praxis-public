import { AppNav } from '@/components/app-nav';
import { getCurrentUser } from '@/lib/current-user';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Settings — Praxis',
};

export default async function SettingsPage() {
  const user = await getCurrentUser();

  return (
    <>
      <AppNav />
      <main className="flex flex-col items-center px-6 py-12">
        <div className="w-full max-w-md space-y-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This is a local, single-user install. Projects and history belong to you
              (<span className="font-medium">{user.email}</span>).
            </p>
          </div>

          <div className="rounded-md border-2 p-4 text-sm text-muted-foreground">
            <p>
              The coding agent runs on your own <code>ANTHROPIC_API_KEY</code> from the
              environment. Set it in <code>.env</code> — it is never stored in the database or
              sent anywhere but Anthropic.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
