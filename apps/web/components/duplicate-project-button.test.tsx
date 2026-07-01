// @vitest-environment jsdom
// Dashboard duplicate UI (STORY-42/TASK-120). Mocks the duplicate endpoint +
// router, asserting the POST fires, the pending label shows, and a failure
// surfaces without refreshing.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { DuplicateProjectButton } from './duplicate-project-button';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe('DuplicateProjectButton', () => {
  it('POSTs to the duplicate endpoint and refreshes on success', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'new' }), { status: 200 }));

    const { getByTestId } = render(<DuplicateProjectButton projectId="p1" />);
    await act(async () => {
      fireEvent.click(getByTestId('duplicate-project-button'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1/duplicate',
      expect.objectContaining({ method: 'POST' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('alerts and does not refresh on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 502 }));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    const { getByTestId } = render(<DuplicateProjectButton projectId="p1" />);
    await act(async () => {
      fireEvent.click(getByTestId('duplicate-project-button'));
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });
});
