import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppNav } from '@/components/app-nav';
import { adminAccess, isUserAdmin } from '@/lib/admin';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin — Praxis',
};

// Guard for every /admin/* route. Middleware only checks cookie presence;
// this is the canonical check (valid session + admin role). See EPIC-05.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const signedIn = Boolean(session?.user);
  const isAdmin = session?.user ? await isUserAdmin(session.user.id) : false;

  const access = adminAccess({ signedIn, isAdmin });
  if (access === 'redirect-signin') redirect('/signin?next=/admin');
  if (access === 'redirect-dashboard') redirect('/dashboard');

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
