'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

// Delete a project from the dashboard (STORY-28). Confirms first, then DELETEs;
// the API destroys the sandbox (container + volume) before removing the rows.
export function DeleteProjectButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onDelete() {
    if (
      !window.confirm(
        `Delete "${projectName}"? This permanently removes the project and its workspace.`,
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        setPending(false);
        window.alert('Could not delete the project. Try again.');
        return;
      }
      router.refresh();
    } catch {
      setPending(false);
      window.alert('Could not delete the project. Try again.');
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={onDelete}
      className="text-destructive hover:text-destructive"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </Button>
  );
}
