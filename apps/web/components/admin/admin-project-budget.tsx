'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Admin budget override for a project (STORY-23). Sets projects.budget_usd via the
// admin route (bypasses ownership); raising it resumes prompting for a paused
// project.

export function AdminProjectBudget({
  projectId,
  budgetUsd,
}: {
  projectId: string;
  budgetUsd: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(budgetUsd.toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ budgetUsd: n }),
      });
      if (!res.ok) {
        setError('Couldn’t update the budget. Try again.');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Couldn’t update the budget. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Budget (USD)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Project budget in USD"
            className="block w-40 rounded-md border px-3 py-1.5 text-sm"
          />
        </label>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
