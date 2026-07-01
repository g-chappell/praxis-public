// @vitest-environment jsdom
// Dashboard search + sort (STORY-41/TASK-116). Client-side filter/sort over the
// loaded list, plus the no-match and empty states.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { ProjectList } from './project-list';
import type { ProjectSummary } from '@/lib/projects';

afterEach(cleanup);

function p(name: string, createdAt: string): ProjectSummary {
  return {
    id: name,
    name,
    description: null,
    createdAt: new Date(createdAt),
    archivedAt: null,
  };
}

const PROJECTS = [
  p('Banana', '2026-01-02T00:00:00Z'),
  p('Apple', '2026-01-03T00:00:00Z'),
  p('Cherry', '2026-01-01T00:00:00Z'),
];

function names(container: HTMLElement): string[] {
  // In the (default) ledger view the name span is the only .font-semibold inside
  // the row's link (the Open / Edit / Archive controls use font-bold, outside the <a>).
  return [...container.querySelectorAll('li a .font-semibold')].map((n) => n.textContent ?? '');
}

describe('ProjectList', () => {
  it('shows the tab-aware empty state when there are no projects', () => {
    const { getByTestId } = render(<ProjectList projects={[]} status="archived" />);
    expect(getByTestId('projects-empty').textContent).toMatch(/no archived projects/i);
  });

  it('defaults to Recent order (newest first)', () => {
    const { container } = render(<ProjectList projects={PROJECTS} status="active" />);
    expect(names(container)).toEqual(['Apple', 'Banana', 'Cherry']);
  });

  it('reorders by Name and by Oldest', () => {
    const { container, getByTestId } = render(<ProjectList projects={PROJECTS} status="active" />);

    fireEvent.change(getByTestId('project-sort'), { target: { value: 'name' } });
    expect(names(container)).toEqual(['Apple', 'Banana', 'Cherry']);

    fireEvent.change(getByTestId('project-sort'), { target: { value: 'oldest' } });
    expect(names(container)).toEqual(['Cherry', 'Banana', 'Apple']);
  });

  it('filters live by name (case-insensitive) and shows a no-match state', () => {
    const { container, getByTestId, queryByTestId } = render(
      <ProjectList projects={PROJECTS} status="active" />,
    );

    fireEvent.change(getByTestId('project-search'), { target: { value: 'an' } });
    // 'Banana' contains "an"; others don't.
    expect(names(container)).toEqual(['Banana']);

    fireEvent.change(getByTestId('project-search'), { target: { value: 'zzz' } });
    expect(queryByTestId('projects-no-match')).not.toBeNull();
    expect(names(container)).toEqual([]);
  });

  it('archived projects have no Open button and a non-clickable name (STORY-52/TASK-160)', () => {
    const archived: ProjectSummary = {
      ...p('Archived One', '2026-01-04T00:00:00Z'),
      archivedAt: new Date('2026-01-05T00:00:00Z'),
    };
    const { container, queryByText, getByTestId } = render(
      <ProjectList projects={[archived]} status="archived" />,
    );

    // No Open button, and the name isn't wrapped in a link to the workspace.
    expect(queryByText('Open')).toBeNull();
    expect(container.querySelector('li a[href="/projects/Archived One"]')).toBeNull();
    expect(container.querySelector('li .font-semibold')?.textContent).toBe('Archived One');

    // Restore is the way back in.
    expect(getByTestId('restore-project-button')).not.toBeNull();
  });

  it('active projects keep the Open button and a clickable name', () => {
    const { container, getByText } = render(
      <ProjectList projects={[p('Live One', '2026-01-04T00:00:00Z')]} status="active" />,
    );
    expect(getByText('Open')).not.toBeNull();
    expect(container.querySelector('li a[href="/projects/Live One"]')).not.toBeNull();
  });
});
