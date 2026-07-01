// @vitest-environment jsdom
// Admin moderation actions (STORY-44): a reason is required, and confirm calls
// the admin archive/delete endpoints with that reason.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

import { AdminProjectActions } from './admin-project-actions';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminProjectActions', () => {
  it('requires a reason before archiving', async () => {
    render(<AdminProjectActions projectId="p1" archived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('A reason is required.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('archives with the typed reason via PATCH and refreshes', async () => {
    render(<AdminProjectActions projectId="p1" archived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    fireEvent.change(screen.getByLabelText('Moderation reason'), {
      target: { value: 'TOS violation' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/projects/p1');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ archived: true, reason: 'TOS violation' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('deletes with a reason via DELETE and returns to the directory', async () => {
    render(<AdminProjectActions projectId="p1" archived={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.change(screen.getByLabelText('Moderation reason'), {
      target: { value: 'abuse' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/projects/p1');
    expect(opts.method).toBe('DELETE');
    expect(JSON.parse(opts.body)).toEqual({ reason: 'abuse' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/projects'));
  });

  it('shows Restore for an already-archived project', () => {
    render(<AdminProjectActions projectId="p1" archived={true} />);
    expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy();
  });
});
