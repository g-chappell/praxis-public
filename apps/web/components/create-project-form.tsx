'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Stamp } from '@/components/ui/stamp';
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from '@/lib/templates';
import { cn } from '@/lib/utils';

// Create a project: pick a name + a template, then POST. Shown as a button that
// opens a small popover form.
export function CreateProjectForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string>(DEFAULT_TEMPLATE_ID);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), templateId }),
      });
      if (!res.ok) {
        setPending(false);
        setError('Could not create the project. Try again.');
        return;
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/projects/${id}`);
    } catch {
      setPending(false);
      setError('Could not create the project. Try again.');
    }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New project</Button>;
  }

  return (
    <div className="relative">
      <Button disabled>New project</Button>
      <Card className="absolute right-0 top-full z-10 mt-2 w-96 p-4 text-left">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="project-name" className="label-mono block">
              Name
            </label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Untitled project"
              className="text-lg italic"
              autoFocus
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="label-mono mb-1">Template</legend>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => {
                const selected = templateId === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTemplateId(t.id)}
                    aria-pressed={selected}
                    className={cn(
                      'border-2 p-2 text-left transition-transform',
                      selected
                        ? 'border-stamp shadow-hard-stamp'
                        : 'border-border hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm',
                    )}
                  >
                    <span
                      className={cn(
                        '-m-2 mb-2 block px-2 py-1 text-sm font-semibold',
                        selected ? 'bg-foreground text-background' : 'border-b-2 border-border',
                      )}
                    >
                      {t.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">{t.description}</span>
                    {selected && (
                      <span className="mt-2 block">
                        <Stamp>✓ Selected</Stamp>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="stamp" size="sm" disabled={pending}>
              {pending ? 'Creating…' : 'Create project'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
