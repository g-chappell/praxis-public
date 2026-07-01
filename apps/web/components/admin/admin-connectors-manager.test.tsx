// @vitest-environment jsdom
// Admin connectors manager (STORY-50): lists connectors with per-template
// toggles, adds one via POST, and toggles a template enablement via PUT.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminConnectorsManager } from './admin-connectors-manager';

const CONNECTOR = {
  id: 'c1',
  name: 'image-gen',
  commandRef: 'image-gen',
  usageCap: 50,
  hasCredential: true,
  templates: [{ templateId: 'react-threejs-scene', enabled: true, allowedCommands: null }],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async (_url: string, opts?: { method?: string }) => {
    if (opts?.method === 'POST') return new Response(JSON.stringify({ id: 'c2' }), { status: 201 });
    if (opts?.method === 'PUT') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    return new Response(JSON.stringify({ connectors: [CONNECTOR] }), { status: 200 }); // GET
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('AdminConnectorsManager', () => {
  it('lists connectors with their template toggles', async () => {
    render(<AdminConnectorsManager />);
    expect(await screen.findByText('image-gen')).toBeTruthy();
    const toggle = screen.getByLabelText(
      'Enable image-gen for react-threejs-scene',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
  });

  it('adds a connector via POST', async () => {
    render(<AdminConnectorsManager />);
    await screen.findByText('image-gen');
    fireEvent.change(screen.getByLabelText('Connector name'), { target: { value: 'docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(post![1].body).name).toBe('docs');
    });
  });

  it('toggles a template enablement via PUT', async () => {
    render(<AdminConnectorsManager />);
    await screen.findByText('image-gen');
    fireEvent.click(screen.getByLabelText('Enable image-gen for blank'));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeTruthy();
      expect(String(put![0])).toBe('/api/admin/connectors/c1/templates');
      expect(JSON.parse(put![1].body)).toEqual({ templateId: 'blank', enabled: true });
    });
  });
});
