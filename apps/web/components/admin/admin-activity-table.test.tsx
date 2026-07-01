// @vitest-environment jsdom
// Audit log viewer (STORY-47): renders entries, distinguishes empty from
// no-match, forwards the action filter, and honors a scoped deep-link.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@praxis/db', () => ({
  auditAction: { enumValues: ['project.deleted', 'user.banned'] },
}));

import { AdminActivityTable } from './admin-activity-table';

const ENTRY = {
  id: 'a1',
  action: 'project.deleted',
  actorUserId: 'u1',
  actorEmail: 'ada@example.test',
  targetType: 'project',
  targetId: 'p1234567',
  createdAt: '2026-06-07T00:00:00.000Z',
};

let respond: (url: string) => { entries: unknown[]; total: number };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  respond = () => ({ entries: [ENTRY], total: 1 });
  fetchMock = vi.fn(
    async (url: string) => new Response(JSON.stringify(respond(url)), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminActivityTable', () => {
  it('lists entries with actor email + action', async () => {
    render(<AdminActivityTable />);
    expect(await screen.findByText('ada@example.test')).toBeTruthy();
    // Scope to the table cell — the action name also appears as a filter <option>.
    expect(screen.getByRole('cell', { name: 'project.deleted' })).toBeTruthy();
  });

  it('shows the "no activity yet" empty state when unfiltered + empty', async () => {
    respond = () => ({ entries: [], total: 0 });
    render(<AdminActivityTable />);
    expect(await screen.findByText('No activity yet.')).toBeTruthy();
  });

  it('shows the "no match" state when a filter is active + empty', async () => {
    respond = () => ({ entries: [], total: 0 });
    render(<AdminActivityTable scoped={{ targetType: 'project', targetId: 'p1' }} />);
    expect(await screen.findByText('No entries match these filters.')).toBeTruthy();
  });

  it('forwards the action filter to ?action', async () => {
    render(<AdminActivityTable />);
    await screen.findByText('ada@example.test');
    fireEvent.change(screen.getByLabelText('Filter by action'), {
      target: { value: 'user.banned' },
    });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('action=user.banned'))).toBe(true);
    });
  });

  it('applies a scoped target deep-link to the query', async () => {
    render(<AdminActivityTable scoped={{ targetType: 'project', targetId: 'p1' }} />);
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('targetType=project') && u.includes('targetId=p1'))).toBe(
        true,
      );
    });
  });
});
