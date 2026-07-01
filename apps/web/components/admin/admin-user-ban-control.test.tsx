// @vitest-environment jsdom
// Ban control (STORY-46): ban requires a reason; self-ban is disabled; unban
// calls the endpoint; server guard errors are surfaced.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AdminUserBanControl } from './admin-user-ban-control';

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

describe('AdminUserBanControl', () => {
  it('disables banning yourself', () => {
    render(<AdminUserBanControl userId="me" banned={false} isSelf={true} />);
    expect((screen.getByRole('button', { name: 'Ban' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('requires a reason before banning', async () => {
    render(<AdminUserBanControl userId="u2" banned={false} isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ban user' }));
    expect(await screen.findByText('A reason is required.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bans with a reason via PATCH and refreshes', async () => {
    render(<AdminUserBanControl userId="u2" banned={false} isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ban' }));
    fireEvent.change(screen.getByLabelText('Ban reason'), { target: { value: 'abuse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ban user' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/users/u2');
    expect(JSON.parse(opts.body)).toEqual({ banned: true, reason: 'abuse' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('unbans an already-banned user', async () => {
    render(<AdminUserBanControl userId="u2" banned={true} isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Unban' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ banned: false });
  });
});
