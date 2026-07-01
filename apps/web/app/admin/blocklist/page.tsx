import Link from 'next/link';

import { AdminBlocklistManager } from '@/components/admin/admin-blocklist-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin blocklist — Praxis',
};

// Email/domain sign-in blocklist (STORY-46). The admin layout gates access; the
// manager reads/writes the admin-gated API.
export default function AdminBlocklistPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in blocklist</h1>
        <p className="text-sm text-muted-foreground">
          Block an email address or a whole domain from requesting a magic link.
        </p>
      </div>
      <AdminBlocklistManager />
    </div>
  );
}
