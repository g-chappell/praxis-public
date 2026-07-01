// @vitest-environment jsdom
// Create-project form (STORY-54/57). Teamless → create-or-join-a-team guidance
// (never the form), and a POST that races to 409 needs_team falls back to it. A
// user with teams picks which team the project belongs to via the selector.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

import { CreateProjectForm } from './create-project-form';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockReset();
});

describe('CreateProjectForm — teamless guidance', () => {
  it('shows the create-or-join-a-team guidance (not the form) when the user has no team', () => {
    const { getByText, getByTestId, queryByLabelText } = render(<CreateProjectForm teams={[]} />);
    fireEvent.click(getByText('New project'));

    const guidance = getByTestId('needs-team-guidance');
    expect(guidance).toBeTruthy();
    expect(guidance.querySelector('a[href="/settings"]')).toBeTruthy();
    // The project form never renders for a teamless user.
    expect(queryByLabelText('Name')).toBeNull();
  });

  it('falls back to the guidance when the POST returns 409 needs_team', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'needs_team' }), { status: 409 }),
    );

    const { getByText, getByTestId, getByPlaceholderText } = render(
      <CreateProjectForm teams={[{ id: 't1', name: 'Acme' }]} />,
    );
    fireEvent.click(getByText('New project'));
    fireEvent.change(getByPlaceholderText('Untitled project'), { target: { value: 'My scene' } });
    await act(async () => {
      fireEvent.click(getByText('Create project'));
    });

    await waitFor(() => getByTestId('needs-team-guidance'));
    expect(push).not.toHaveBeenCalled();
  });
});

describe('CreateProjectForm — team selector', () => {
  it('lists the teams (most-recent preselected) and POSTs the chosen teamId', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'p1' }), { status: 200 }));

    const { getByText, getByTestId, getByPlaceholderText } = render(
      <CreateProjectForm
        teams={[
          { id: 'team-b', name: 'Beta' },
          { id: 'team-a', name: 'Alpha' },
        ]}
      />,
    );
    fireEvent.click(getByText('New project'));

    const select = getByTestId('create-project-team-select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['Beta', 'Alpha']);
    expect(select.value).toBe('team-b'); // most-recent (first) preselected

    fireEvent.change(select, { target: { value: 'team-a' } });
    fireEvent.change(getByPlaceholderText('Untitled project'), { target: { value: 'My scene' } });
    await act(async () => {
      fireEvent.click(getByText('Create project'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        body: expect.stringContaining('"teamId":"team-a"'),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p1'));
  });
});
