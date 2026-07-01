import { headers } from 'next/headers';
import Link from 'next/link';

import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { TweaksPanel } from '@/components/tweaks-panel';
import { Monogram } from '@/components/ui/monogram';
import { isUserAdmin } from '@/lib/admin';
import { getAuth } from '@/lib/auth';

// Shared top navigation for signed-in pages so a user can always move between
// surfaces. Self-contained (reads the session + role) so pages just render
// <AppNav />. A richer workspace shell comes later (roadmap).
export async function AppNav() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const admin = await isUserAdmin(session.user.id);

  const link = 'label-mono transition-colors hover:text-foreground';

  return (
    <header className="flex items-center justify-between border-b-2 px-6 py-3">
      <nav className="flex items-center gap-5">
        <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-foreground">
          Praxis
        </Link>
        <Link href="/dashboard" className={link}>
          Projects
        </Link>
        {admin && (
          <Link href="/admin" className={link}>
            Admin
          </Link>
        )}
        <Link href="/settings" className={link}>
          Settings
        </Link>
      </nav>
      <div className="flex items-center gap-2">
        <TweaksPanel />
        <ThemeToggle />
        <SignOutButton />
        <Monogram
          variant="ink"
          name={session.user.name || session.user.email}
          title={session.user.email}
        />
      </div>
    </header>
  );
}
