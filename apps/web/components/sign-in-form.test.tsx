// @vitest-environment jsdom
// SignInForm honours the `next` param as the magic-link callbackURL (STORY-31),
// so an invitee returns to /invite/<code> after verifying.
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const magicLink = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { magicLink: (args: unknown) => magicLink(args) } },
}));

const search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => search,
}));

import { SignInForm } from './sign-in-form';

afterEach(() => {
  cleanup();
  magicLink.mockClear();
  search.delete('next');
});

async function submit(
  getByLabelText: ReturnType<typeof render>['getByLabelText'],
  getByRole: ReturnType<typeof render>['getByRole'],
) {
  fireEvent.change(getByLabelText(/email/i), { target: { value: 'a@b.test' } });
  await act(async () => {
    fireEvent.submit(getByRole('button').closest('form')!);
  });
}

describe('SignInForm callbackURL', () => {
  it('uses a valid next path as the magic-link callbackURL', async () => {
    search.set('next', '/invite/abc123');
    const { getByLabelText, getByRole } = render(<SignInForm />);
    await submit(getByLabelText, getByRole);
    await waitFor(() =>
      expect(magicLink).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'a@b.test', callbackURL: '/invite/abc123' }),
      ),
    );
  });

  it('defaults to /dashboard when next is missing or unsafe', async () => {
    search.set('next', 'https://evil.com');
    const { getByLabelText, getByRole } = render(<SignInForm />);
    await submit(getByLabelText, getByRole);
    await waitFor(() =>
      expect(magicLink).toHaveBeenCalledWith(
        expect.objectContaining({ callbackURL: '/dashboard' }),
      ),
    );
  });
});
