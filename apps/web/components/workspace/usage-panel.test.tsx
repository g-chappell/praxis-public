// @vitest-environment jsdom
// Usage panel (STORY-22/23): renders cumulative usage + budget, surfaces the
// over-budget pause, and saves a new budget.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UsagePanel } from './usage-panel';

function usageResponse(over = false) {
  return {
    inputTokens: 1234,
    outputTokens: 567,
    estimatedCostUsd: over ? 11 : 0.0123,
    turns: 3,
    budgetUsd: 10,
    overBudget: over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async (_url: string, opts?: { method?: string }) =>
    opts?.method === 'PATCH'
      ? new Response(JSON.stringify({ ok: true }), { status: 200 })
      : new Response(JSON.stringify(usageResponse(false)), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('UsagePanel', () => {
  it('renders token totals, cost vs budget, and turn count', async () => {
    render(<UsagePanel projectId="p1" />);
    expect(await screen.findByText('1,234')).toBeTruthy(); // input tokens
    expect(screen.getByText('567')).toBeTruthy(); // output tokens
    expect(screen.getByText('$0.01')).toBeTruthy(); // estimated cost
    expect(screen.getByText(/of \$10\.00 budget/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/usage');
  });

  it('surfaces the over-budget pause notice', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify(usageResponse(true)), { status: 200 }),
    );
    render(<UsagePanel projectId="p1" />);
    expect(await screen.findByText(/over budget — prompting is paused/)).toBeTruthy();
  });

  it('saves a new budget via PATCH', async () => {
    render(<UsagePanel projectId="p1" />);
    await screen.findByText('1,234');
    fireEvent.change(screen.getByLabelText('Budget in USD'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(patch).toBeTruthy();
      expect(JSON.parse(patch![1].body)).toEqual({ budgetUsd: 25 });
    });
  });

  it('shows an error state when the API fails', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 403 }));
    render(<UsagePanel projectId="p1" />);
    expect(await screen.findByText('Couldn’t load usage.')).toBeTruthy();
  });
});
