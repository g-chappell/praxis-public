// @vitest-environment jsdom
// Dashboard archive / restore UI (STORY-40/TASK-113). Mocks the PATCH endpoint,
// the router, and window.confirm, asserting the right archived flag is sent and
// the list refreshes.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { ArchiveProjectButton } from './archive-project-button';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe('ArchiveProjectButton', () => {
  it('archives (PATCH {archived:true}) after a confirm, then refreshes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { getByTestId } = render(
      <ArchiveProjectButton projectId="p1" projectName="My scene" archived={false} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId('archive-project-button'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ archived: true }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not archive when the confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = vi.spyOn(global, 'fetch');

    const { getByTestId } = render(
      <ArchiveProjectButton projectId="p1" projectName="My scene" archived={false} />,
    );
    fireEvent.click(getByTestId('archive-project-button'));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('restores (PATCH {archived:false}) with no confirm, then refreshes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { getByTestId } = render(
      <ArchiveProjectButton projectId="p1" projectName="My scene" archived={true} />,
    );
    await act(async () => {
      fireEvent.click(getByTestId('restore-project-button'));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ archived: false }) }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
