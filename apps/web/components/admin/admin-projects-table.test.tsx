// @vitest-environment jsdom
// Admin projects table (STORY-44): renders rows from the admin API and forwards
// the search box to the ?q query.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminProjectsTable } from './admin-projects-table';

const PROJECTS = [
  {
    id: 'p1',
    name: 'Ada Scene',
    ownerName: 'Ada',
    ownerEmail: 'ada@example.test',
    memberCount: 2,
    archivedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    lastActivityAt: '2026-06-07T00:00:00.000Z',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ projects: PROJECTS }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminProjectsTable', () => {
  it('lists projects from the admin API with owner + member count', async () => {
    render(<AdminProjectsTable />);
    expect(await screen.findByText('Ada Scene')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    const firstUrl = String(fetchMock.mock.calls[0]![0]);
    expect(firstUrl).toContain('/api/admin/projects?');
    expect(firstUrl).toContain('sort=recent');
    expect(firstUrl).toContain('status=all');
  });

  it('forwards the search box to ?q', async () => {
    render(<AdminProjectsTable />);
    await screen.findByText('Ada Scene');
    fireEvent.change(screen.getByLabelText('Search projects'), { target: { value: 'ada' } });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('q=ada'))).toBe(true);
    });
  });

  it('shows an error state when the API fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    render(<AdminProjectsTable />);
    expect(await screen.findByText('Couldn’t load projects. Try again.')).toBeTruthy();
  });
});
