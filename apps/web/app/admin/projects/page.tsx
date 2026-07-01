import Link from 'next/link';

import { AdminProjectsTable } from '@/components/admin/admin-projects-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin projects — Praxis',
};

// Admin projects directory (STORY-44). The admin layout already gates access; the
// table reads the admin-gated API for the data.
export default function AdminProjectsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Every project across the platform. Open one to view its members, activity, and moderation
          actions.
        </p>
      </div>
      <AdminProjectsTable />
    </div>
  );
}
