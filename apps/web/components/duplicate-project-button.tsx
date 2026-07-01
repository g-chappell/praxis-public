'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Duplicate a project from the dashboard (STORY-42). POSTs to the duplicate
// endpoint (which copies the sandbox volume), then refreshes so the new
// "Copy of <name>" row appears. Mirrors the DeleteProjectButton client pattern.
export function DuplicateProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        setPending(false);
        window.alert('Could not duplicate the project. Try again.');
        return;
      }
      router.refresh();
    } catch {
      setPending(false);
      window.alert('Could not duplicate the project. Try again.');
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={onClick}
      data-testid="duplicate-project-button"
    >
      {pending ? 'Duplicating…' : 'Duplicate'}
    </Button>
  );
}
