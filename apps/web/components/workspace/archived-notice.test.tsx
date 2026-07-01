// @vitest-environment jsdom
// ArchivedNotice (STORY-52): the read-only view for an archived project. Restore
// PATCHes {archived:false}; "Back to dashboard" navigates away.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

import { ArchivedNotice } from './archived-notice';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ id: 'p1', archived: false }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  // jsdom has no reload; stub it so restore's reload() doesn't throw.
  Object.defineProperty(window, 'location', { value: { reload: vi.fn() }, writable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ArchivedNotice', () => {
  it('shows the read-only/archived message', () => {
    render(<ArchivedNotice projectId="p1" />);
    expect(screen.getByRole('heading', { name: /this project is archived/i })).toBeTruthy();
    expect(screen.getByText(/read-only/i)).toBeTruthy();
  });

  it('Restore PATCHes {archived:false}', async () => {
    render(<ArchivedNotice projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore project' }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/p1',
        expect.objectContaining({ method: 'PATCH' }),
      );
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(body).toEqual({ archived: false });
    });
  });

  it('surfaces an error when restore fails', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 500 }));
    render(<ArchivedNotice projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore project' }));
    expect(await screen.findByText(/Couldn’t restore/i)).toBeTruthy();
  });

  it('Back to dashboard navigates', () => {
    render(<ArchivedNotice projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to dashboard' }));
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});
