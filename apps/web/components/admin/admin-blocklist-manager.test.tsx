// @vitest-environment jsdom
// Blocklist manager (STORY-46): lists entries, adds one via POST, removes via
// DELETE.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminBlocklistManager } from './admin-blocklist-manager';

const ENTRY = {
  id: 'b1',
  value: 'spam.test',
  isDomain: true,
  reason: 'abuse',
  createdAt: '2026-06-07T00:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async (url: string, opts?: { method?: string }) => {
    if (opts?.method === 'POST')
      return new Response(JSON.stringify({ entry: ENTRY }), { status: 201 });
    if (opts?.method === 'DELETE')
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify({ entries: [ENTRY] }), { status: 200 }); // GET
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminBlocklistManager', () => {
  it('lists existing entries', async () => {
    render(<AdminBlocklistManager />);
    expect(await screen.findByText('spam.test')).toBeTruthy();
    expect(screen.getByText(/domain · abuse/)).toBeTruthy();
  });

  it('adds an entry via POST', async () => {
    render(<AdminBlocklistManager />);
    await screen.findByText('spam.test');
    fireEvent.change(screen.getByLabelText('Email or domain to block'), {
      target: { value: 'evil.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(post![1].body).value).toBe('evil.test');
    });
  });

  it('removes an entry via DELETE', async () => {
    render(<AdminBlocklistManager />);
    await screen.findByText('spam.test');
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      const del = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE');
      expect(del).toBeTruthy();
      expect(String(del![0])).toBe('/api/admin/blocklist/b1');
    });
  });
});
