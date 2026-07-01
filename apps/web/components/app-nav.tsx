import Link from 'next/link';

import { ThemeToggle } from '@/components/theme-toggle';
import { TweaksPanel } from '@/components/tweaks-panel';
import { Monogram } from '@/components/ui/monogram';
import { getCurrentUser } from '@/lib/current-user';

// Shared top navigation. A local install has one user, so there's no sign-out or
// admin — just the primary surfaces plus display tweaks.
export async function AppNav() {
  const user = await getCurrentUser();

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
        <Link href="/settings" className={link}>
          Settings
        </Link>
      </nav>
      <div className="flex items-center gap-2">
        <TweaksPanel />
        <ThemeToggle />
        <Monogram variant="ink" name={user.name || user.email} title={user.email} />
      </div>
    </header>
  );
}
