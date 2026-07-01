'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ArchiveProjectButton } from '@/components/archive-project-button';
import { DeleteProjectButton } from '@/components/delete-project-button';
import { DuplicateProjectButton } from '@/components/duplicate-project-button';
import { EditProjectButton } from '@/components/edit-project-button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Stamp } from '@/components/ui/stamp';
import type { ProjectSort, ProjectStatus, ProjectSummary } from '@/lib/projects';
import { cn } from '@/lib/utils';

// Dashboard project list with client-side search + sort (STORY-41) and a
// List ↔ Bookshelf view toggle (redesign). The server fetches the status-filtered
// slice; filtering, ordering, and view selection happen here over the loaded array
// — sufficient at POC scale. The Active/Archived tabs live in the server page.
const SORTS: { value: ProjectSort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'name', label: 'Name' },
];

type View = 'list' | 'shelf';

function compare(a: ProjectSummary, b: ProjectSummary, sort: ProjectSort): number {
  if (sort === 'name') return a.name.localeCompare(b.name);
  const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return sort === 'oldest' ? at - bt : bt - at;
}

function callNumber(index: number): string {
  return `PX·${String(index + 1).padStart(2, '0')}`;
}

export function ProjectList({
  projects,
  status,
}: {
  projects: ProjectSummary[];
  status: ProjectStatus;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ProjectSort>('recent');
  const [view, setView] = useState<View>('list');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => compare(a, b, sort));
  }, [projects, query, sort]);

  // Distinct from the no-match state below: the user has no projects in this tab.
  if (projects.length === 0) {
    return (
      <Card variant="flat" className="border-dashed px-6 py-12 text-center">
        <p className="text-muted-foreground" data-testid="projects-empty">
          {status === 'archived'
            ? 'No archived projects.'
            : 'No projects yet. Start one to build with the assistant.'}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          aria-label="Search projects"
          data-testid="project-search"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ProjectSort)}
          aria-label="Sort projects"
          data-testid="project-sort"
          className="h-10 shrink-0 border-2 bg-field px-3 font-mono text-xs"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex shrink-0">
          {(['list', 'shelf'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              data-testid={`view-${v}`}
              className={cn(
                'h-10 border-2 px-3 font-mono text-[0.625rem] font-bold uppercase tracking-wide',
                v === 'shelf' && '-ml-0.5',
                view === v
                  ? 'bg-foreground text-background'
                  : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {v === 'list' ? 'List' : 'Shelf'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card variant="flat" className="border-dashed px-6 py-12 text-center">
          <p className="text-muted-foreground" data-testid="projects-no-match">
            No projects match “{query.trim()}”.
          </p>
        </Card>
      ) : view === 'list' ? (
        <LedgerView projects={visible} />
      ) : (
        <ShelfView projects={visible} />
      )}
    </div>
  );
}

function ProjectActions({ p, archived }: { p: ProjectSummary; archived: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {!archived && (
        <>
          <Link
            href={`/projects/${p.id}`}
            className="border-2 border-foreground bg-background px-3 py-1.5 font-mono text-[0.625rem] font-bold uppercase tracking-wide shadow-hard-sm hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Open
          </Link>
          <EditProjectButton projectId={p.id} name={p.name} description={p.description} />
          <DuplicateProjectButton projectId={p.id} />
        </>
      )}
      <ArchiveProjectButton projectId={p.id} projectName={p.name} archived={archived} />
      <DeleteProjectButton projectId={p.id} projectName={p.name} />
    </div>
  );
}

function LedgerView({ projects }: { projects: ProjectSummary[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b-2 bg-muted px-4 py-2">
        <span className="label-mono">#</span>
        <span className="label-mono">Project</span>
        <span className="label-mono">Status · Open</span>
      </div>
      <ul className="divide-y-2">
        {projects.map((p, i) => {
          const archived = p.archivedAt !== null;
          const name = <span className="block truncate text-lg font-semibold">{p.name}</span>;
          return (
            <li
              key={p.id}
              className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 px-4 py-3"
            >
              <span className="font-mono text-xs text-muted-foreground">{callNumber(i)}</span>
              <div className="min-w-0">
                {archived ? (
                  name
                ) : (
                  <Link href={`/projects/${p.id}`} className="hover:underline">
                    {name}
                  </Link>
                )}
                {p.description && (
                  <span className="block truncate text-sm italic text-muted-foreground">
                    {p.description}
                  </span>
                )}
                <span className="label-mono mt-0.5 block" data-testid="project-team-label">
                  {p.teamName}
                  {p.createdAt && ` · Created ${new Date(p.createdAt).toISOString().slice(0, 10)}`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Stamp solid={!archived}>{archived ? 'Archived' : 'Active'}</Stamp>
                <ProjectActions p={p} archived={archived} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ShelfView({ projects }: { projects: ProjectSummary[] }) {
  return (
    <div className="border-2 bg-muted p-6 shadow-hard">
      <div className="flex flex-wrap items-end gap-3 border-b-[6px] border-foreground pb-0">
        {projects.map((p, i) => {
          const archived = p.archivedAt !== null;
          const spine = (
            <div
              className={cn(
                'flex h-56 w-14 flex-col items-center justify-between border-2 border-foreground py-3 shadow-hard-sm transition-transform',
                archived ? 'bg-background' : 'bg-card hover:-translate-y-1',
              )}
            >
              <span className="font-mono text-[0.55rem] tracking-tight text-muted-foreground">
                {callNumber(i)}
              </span>
              <span
                className="flex-1 py-2 text-center text-sm font-semibold italic"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                {p.name}
              </span>
              <span
                aria-hidden
                className={cn('size-2', archived ? 'bg-muted-foreground' : 'bg-stamp')}
                title={archived ? 'Archived' : 'Active'}
              />
            </div>
          );
          return (
            <div key={p.id} className="group flex flex-col items-center gap-2">
              {archived ? (
                <span title={p.name}>{spine}</span>
              ) : (
                <Link href={`/projects/${p.id}`} title={p.name} aria-label={`Open ${p.name}`}>
                  {spine}
                </Link>
              )}
              <span
                data-testid="project-team-label"
                title={p.teamName}
                className="max-w-14 truncate text-[0.6rem] text-muted-foreground"
              >
                {p.teamName}
              </span>
              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                <ProjectActions p={p} archived={archived} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
