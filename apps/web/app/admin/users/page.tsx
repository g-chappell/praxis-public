import Link from 'next/link';

import { AdminUsersTable } from '@/components/admin/admin-users-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin users — Praxis',
};

// Admin users directory (STORY-45). The admin layout already gates access; the
// table reads the admin-gated API.
export default function AdminUsersPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Everyone on the platform. Open a user to see their projects and manage their role.
        </p>
      </div>
      <AdminUsersTable />
    </div>
  );
}
