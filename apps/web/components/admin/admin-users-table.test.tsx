// @vitest-environment jsdom
// Admin users table (STORY-45): renders rows from the admin API and forwards the
// search box to ?q.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminUsersTable } from './admin-users-table';

const USERS = [
  {
    id: 'u1',
    email: 'ada@example.test',
    name: 'Ada',
    role: 'admin' as const,
    bannedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    projectCount: 3,
  },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ users: USERS }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminUsersTable', () => {
  it('lists users with role + project count', async () => {
    render(<AdminUsersTable />);
    expect(await screen.findByText('ada@example.test')).toBeTruthy();
    expect(screen.getByText('Admin')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/admin/users?');
  });

  it('forwards the search box to ?q', async () => {
    render(<AdminUsersTable />);
    await screen.findByText('ada@example.test');
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'ada' } });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('q=ada'))).toBe(true);
    });
  });

  it('shows an error state when the API fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    render(<AdminUsersTable />);
    expect(await screen.findByText('Couldn’t load users. Try again.')).toBeTruthy();
  });
});
