// @vitest-environment jsdom
// Dashboard rename / re-describe UI (STORY-39/TASK-109). Mocks the PATCH
// endpoint + the router and asserts: Edit reveals pre-filled fields, an empty
// name disables Save, and a successful save PATCHes then refreshes.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import { EditProjectButton } from './edit-project-button';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockReset();
});

describe('EditProjectButton', () => {
  it('reveals a form pre-filled with the current name + description', () => {
    const { getByTestId } = render(
      <EditProjectButton projectId="p1" name="My scene" description="a cube" />,
    );
    fireEvent.click(getByTestId('edit-project-button'));

    expect((getByTestId('edit-project-name') as HTMLInputElement).value).toBe('My scene');
    expect((getByTestId('edit-project-description') as HTMLTextAreaElement).value).toBe('a cube');
  });

  it('disables Save when the name is emptied', () => {
    const { getByTestId } = render(
      <EditProjectButton projectId="p1" name="My scene" description={null} />,
    );
    fireEvent.click(getByTestId('edit-project-button'));

    expect((getByTestId('edit-project-save') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(getByTestId('edit-project-name'), { target: { value: '   ' } });
    expect((getByTestId('edit-project-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('PATCHes trimmed values and refreshes on success', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'p1', name: 'Renamed', description: 'new' }), {
        status: 200,
      }),
    );

    const { getByTestId } = render(
      <EditProjectButton projectId="p1" name="My scene" description="old" />,
    );
    fireEvent.click(getByTestId('edit-project-button'));
    fireEvent.change(getByTestId('edit-project-name'), { target: { value: '  Renamed  ' } });
    fireEvent.change(getByTestId('edit-project-description'), { target: { value: ' new ' } });
    await act(async () => {
      fireEvent.click(getByTestId('edit-project-save'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/p1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed', description: 'new' }),
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('shows an inline error and keeps the form open on a failed save', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));

    const { getByTestId } = render(
      <EditProjectButton projectId="p1" name="My scene" description={null} />,
    );
    fireEvent.click(getByTestId('edit-project-button'));
    await act(async () => {
      fireEvent.click(getByTestId('edit-project-save'));
    });

    await waitFor(() => getByTestId('edit-project-error'));
    expect(refresh).not.toHaveBeenCalled();
    // Form is still open (fields remain editable).
    expect(getByTestId('edit-project-name')).toBeTruthy();
  });
});
