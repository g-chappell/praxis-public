import Link from 'next/link';

import { AdminActivityTable } from '@/components/admin/admin-activity-table';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin activity — Praxis',
};

// Audit log viewer (STORY-47). The admin layout gates access; the table reads the
// admin-gated API. `searchParams` carry an optional scoped deep-link (actor or
// target) from a project/user detail page.
export default function AdminActivityPage({
  searchParams,
}: {
  searchParams: { actor?: string; targetType?: string; targetId?: string };
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Every audited admin action, newest first. Filter by action or time range.
        </p>
      </div>
      <AdminActivityTable
        scoped={{
          actor: searchParams.actor,
          targetType: searchParams.targetType,
          targetId: searchParams.targetId,
        }}
      />
    </div>
  );
}
