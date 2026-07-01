import { headers } from 'next/headers';

import { AdminOverviewDashboard } from '@/components/admin/admin-overview-dashboard';
import { adminOverview } from '@/lib/admin-overview';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin overview — Praxis',
};

// Live admin landing (STORY-48): platform counts, key status, running sandboxes,
// and recent admin actions. The admin layout already enforced access. The
// overview's orchestrator call degrades gracefully if it's unreachable.
export default async function AdminOverviewPage() {
  const [session, overview] = await Promise.all([
    getAuth().api.getSession({ headers: await headers() }),
    adminOverview(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{session?.user.email}</span>.
        </p>
      </div>
      <AdminOverviewDashboard overview={overview} />
    </div>
  );
}
