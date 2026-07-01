'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Archive or restore a project from the dashboard (STORY-40). Archiving is
// reversible (it only sets archived_at; the volume is untouched), so — unlike
// DeleteProjectButton — it uses a lightweight confirm and no scary copy. The
// same component renders Restore when the row is already archived.
export function ArchiveProjectButton({
  projectId,
  projectName,
  archived,
}: {
  projectId: string;
  projectName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    // Archiving is reversible — a soft confirm; restoring needs none.
    if (!archived && !window.confirm(`Archive "${projectName}"? You can restore it later.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived: !archived }),
      });
      if (!res.ok) {
        setPending(false);
        window.alert(`Could not ${archived ? 'restore' : 'archive'} the project. Try again.`);
        return;
      }
      router.refresh();
    } catch {
      setPending(false);
      window.alert(`Could not ${archived ? 'restore' : 'archive'} the project. Try again.`);
    }
  }

  const label = archived ? 'Restore' : 'Archive';
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={onClick}
      data-testid={archived ? 'restore-project-button' : 'archive-project-button'}
    >
      {pending ? `${label.slice(0, -1)}ing…` : label}
    </Button>
  );
}
