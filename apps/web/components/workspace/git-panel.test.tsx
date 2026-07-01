// @vitest-environment jsdom
// GitPanel UI (STORY-16/TASK-046). Mocks the git proxy endpoints + Monaco's
// DiffEditor and asserts: the log + branch render, selecting a commit loads its
// file diff, the 409 (no session) message, and the type-the-SHA revert flow
// (disabled until the SHA matches, POSTs revert, reloads).
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Monaco needs a browser; stub it so the panel logic is testable in jsdom.
vi.mock('@monaco-editor/react', () => ({
  loader: { config: vi.fn() },
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="diff-editor" data-original={original} data-modified={modified} />
  ),
}));

import { GitPanel } from './git-panel';

const COMMITS = [
  { sha: 'aaaaaaa1111', author: 'Ada', date: '2026-06-06T10:00:00Z', message: 'Add cube' },
  { sha: 'bbbbbbb2222', author: 'Bo', date: '2026-06-06T11:00:00Z', message: 'Tweak colors' },
];

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  return vi
    .spyOn(global, 'fetch')
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const { status = 200, body = {} } = (handler(url, init) ?? {}) as {
        status?: number;
        body?: unknown;
      };
      return new Response(JSON.stringify(body), { status });
    });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GitPanel', () => {
  beforeEach(() => {
    mockFetch((url) => {
      if (url.includes('/git/status')) return { body: { branch: 'main', entries: [] } };
      if (url.includes('/git/log')) return { body: { commits: COMMITS } };
      if (url.includes('/git/diff')) {
        return {
          body: {
            from: 'aaaaaaa1111~1',
            to: 'aaaaaaa1111',
            files: [
              {
                path: 'src/Cube.tsx',
                status: 'M',
                binary: false,
                oldContent: 'old',
                newContent: 'new',
              },
            ],
          },
        };
      }
      return { body: {} };
    });
  });

  it('renders the branch and recent commits', async () => {
    const { findByText, getByText } = render(<GitPanel projectId="p1" />);
    await findByText('Add cube');
    expect(getByText('Tweak colors')).toBeTruthy();
    expect(getByText('main')).toBeTruthy(); // branch label
  });

  it('loads a commit diff when selected (file tab + diff editor)', async () => {
    const { findByText, getByTestId } = render(<GitPanel projectId="p1" />);
    fireEvent.click(await findByText('Add cube'));
    // The changed file appears as a tab, and the (mocked) diff editor mounts.
    await findByText('Cube.tsx');
    await waitFor(() => expect(getByTestId('diff-editor')).toBeTruthy());
    expect(getByTestId('diff-editor').getAttribute('data-modified')).toBe('new');
  });

  it('shows a session hint when no session is live (409)', async () => {
    vi.restoreAllMocks();
    mockFetch(() => ({ status: 409, body: { error: 'no_active_session' } }));
    const { findByText } = render(<GitPanel projectId="p1" />);
    await findByText(/Open a session/i);
  });

  it('revert is gated on typing the short SHA, then POSTs and reloads', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.restoreAllMocks();
    mockFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/git/status')) return { body: { branch: 'main', entries: [] } };
      if (url.includes('/git/log')) return { body: { commits: COMMITS } };
      if (url.includes('/git/diff'))
        return {
          body: {
            files: [{ path: 'a.ts', status: 'M', binary: false, oldContent: '', newContent: '' }],
          },
        };
      if (url.includes('/git/revert')) return { body: { ok: true, head: 'aaaaaaa1111' } };
      return { body: {} };
    });

    const { findByText, getByLabelText, getByRole } = render(<GitPanel projectId="p1" />);
    fireEvent.click(await findByText('Add cube'));
    fireEvent.click(await findByText('Revert to this commit'));

    const revertBtn = getByRole('button', { name: 'Revert' }) as HTMLButtonElement;
    expect(revertBtn.disabled).toBe(true); // nothing typed yet

    fireEvent.change(getByLabelText('Confirm commit SHA'), { target: { value: 'wrong' } });
    expect(revertBtn.disabled).toBe(true);

    fireEvent.change(getByLabelText('Confirm commit SHA'), { target: { value: 'aaaaaaa' } });
    expect(revertBtn.disabled).toBe(false);

    fireEvent.click(revertBtn);
    await waitFor(() => {
      const revert = calls.find((c) => c.url.includes('/git/revert'));
      expect(revert).toBeTruthy();
      expect(revert!.init?.method).toBe('POST');
      expect(revert!.init?.body).toBe(JSON.stringify({ to: 'aaaaaaa1111' }));
    });
  });
});
