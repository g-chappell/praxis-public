// @vitest-environment jsdom
// Admin role control (STORY-45): promote calls the endpoint; self-demotion is
// disabled; server guard errors are surfaced.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AdminUserRoleControl } from './admin-user-role-control';

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

describe('AdminUserRoleControl', () => {
  it('promotes a user to admin via PATCH and refreshes', async () => {
    render(<AdminUserRoleControl userId="u2" role="user" isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make admin' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/users/u2');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ role: 'admin' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('disables removing your own admin role', () => {
    render(<AdminUserRoleControl userId="me" role="admin" isSelf={true} />);
    const btn = screen.getByRole('button', { name: 'Remove admin' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('surfaces the last-admin guard error from the server', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'last_admin' }), { status: 400 }),
    );
    render(<AdminUserRoleControl userId="u2" role="admin" isSelf={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove admin' }));
    expect(await screen.findByText('You can’t remove the last remaining admin.')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});
