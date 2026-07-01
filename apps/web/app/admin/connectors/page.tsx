import Link from 'next/link';

import { AdminConnectorsManager } from '@/components/admin/admin-connectors-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Admin connectors — Praxis',
};

// Admin MCP connector registry (STORY-50, ADR-0020). The admin layout gates
// access; the manager reads/writes the admin-gated API.
export default function AdminConnectorsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin" className="text-xs text-muted-foreground hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">MCP connectors</h1>
        <p className="text-sm text-muted-foreground">
          Curate the MCP connectors available to the agent and enable them per template. Credentials
          are encrypted at rest and never shown.
        </p>
      </div>
      <AdminConnectorsManager />
    </div>
  );
}
