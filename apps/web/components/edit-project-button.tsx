'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';

// Rename / re-describe a project from the dashboard (STORY-39). Mirrors the
// CreateProjectForm popover + the DeleteProjectButton router.refresh() pattern:
// Edit reveals an inline form pre-filled with the current values; Save PATCHes
// and refreshes the (server-rendered) list so the row shows the new values
// without a full navigation. Bounds mirror NAME_MAX/DESCRIPTION_MAX in
// lib/projects.ts (inlined — that module pulls in the server-only db client).
const NAME_MAX = 120;
const DESCRIPTION_MAX = 280;

export function EditProjectButton({
  projectId,
  name: initialName,
  description: initialDescription,
}: {
  projectId: string;
  name: string;
  description: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(initialName);
    setDescription(initialDescription ?? '');
    setError(null);
    setPending(false);
  }

  function onCancel() {
    reset();
    setOpen(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not save changes. Try again.');
        return;
      }
      setOpen(false);
      setPending(false);
      router.refresh();
    } catch {
      setPending(false);
      setError('Could not save changes. Try again.');
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        data-testid="edit-project-button"
        onClick={() => setOpen(true)}
      >
        Edit
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" disabled>
        Edit
      </Button>
      <form
        onSubmit={onSubmit}
        className="absolute right-0 top-full z-10 mt-2 w-80 space-y-3 rounded-md border bg-background p-4 text-left shadow-md"
      >
        <div className="space-y-1">
          <label htmlFor="edit-project-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input
            id="edit-project-name"
            data-testid="edit-project-name"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="edit-project-description"
            className="text-xs font-medium text-muted-foreground"
          >
            Description
          </label>
          <textarea
            id="edit-project-description"
            data-testid="edit-project-description"
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What is this project?"
            className="w-full resize-none rounded-md border px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p data-testid="edit-project-error" className="text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="edit-project-cancel"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            data-testid="edit-project-save"
            disabled={pending || !name.trim()}
          >
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  );
}
