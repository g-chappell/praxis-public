// @vitest-environment jsdom
// Admin usage dashboard (STORY-49): renders totals + top projects/users, and the
// window picker re-queries with a ?from window.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AdminUsageDashboard } from './admin-usage-dashboard';

const OVERVIEW = {
  total: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 1.23, turns: 7 },
  byProject: [
    {
      projectId: 'p1',
      name: 'Ada Scene',
      ownerEmail: 'ada@example.test',
      budgetUsd: 10,
      inputTokens: 800,
      outputTokens: 400,
      estimatedCostUsd: 1.0,
      turns: 5,
    },
  ],
  byUser: [
    {
      ownerId: 'u1',
      email: 'ada@example.test',
      inputTokens: 800,
      outputTokens: 400,
      estimatedCostUsd: 1.0,
      turns: 5,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(OVERVIEW), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminUsageDashboard', () => {
  it('renders totals + top project + top user', async () => {
    render(<AdminUsageDashboard />);
    expect(await screen.findByText('$1.23')).toBeTruthy(); // total spend
    expect(screen.getByText('Ada Scene')).toBeTruthy();
    expect(screen.getAllByText('ada@example.test').length).toBeGreaterThan(0);
    // Default window (30d) sends a ?from.
    expect(String(fetchMock.mock.calls[0]![0])).toContain('from=');
  });

  it('switches to all-time (no ?from) on the window picker', async () => {
    render(<AdminUsageDashboard />);
    await screen.findByText('Ada Scene');
    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    await waitFor(() => {
      const last = String(fetchMock.mock.calls.at(-1)![0]);
      expect(last).toContain('/api/admin/usage?');
      expect(last).not.toContain('from=');
    });
  });

  it('shows an error state when the API fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    render(<AdminUsageDashboard />);
    expect(await screen.findByText('Couldn’t load usage. Try again.')).toBeTruthy();
  });
});
