import Link from 'next/link';

import { AdminUsageDashboard } from '@/components/admin/admin-usage-dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin usage — Praxis',
};

// Admin usage & cost dashboard (STORY-49). The admin layout gates access; the
// dashboard reads the admin-gated API.
export default function AdminUsagePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Usage &amp; cost</h1>
        <p className="text-sm text-muted-foreground">
          Estimated platform spend and the top projects and owners by usage. Adjust a project’s
          budget cap inline.
        </p>
      </div>
      <AdminUsageDashboard />
    </div>
  );
}
