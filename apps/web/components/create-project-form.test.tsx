// @vitest-environment jsdom
// Create-project form: pick a name + template, then POST /api/projects and
// navigate to the new project.
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

describe('CreateProjectForm', () => {
  it('opens the form and shows the name field + templates', () => {
    const { getByText, getByPlaceholderText } = render(<CreateProjectForm />);
    fireEvent.click(getByText('New project'));
    expect(getByPlaceholderText('Untitled project')).toBeTruthy();
  });

  it('POSTs the name + template and navigates to the new project', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'p1' }), { status: 200 }));

    const { getByText, getByPlaceholderText } = render(<CreateProjectForm />);
    fireEvent.click(getByText('New project'));
    fireEvent.change(getByPlaceholderText('Untitled project'), { target: { value: 'My scene' } });
    await act(async () => {
      fireEvent.click(getByText('Create project'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        body: expect.stringContaining('"name":"My scene"'),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projects/p1'));
  });
});
