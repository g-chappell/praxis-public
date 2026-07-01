// Unit tests for PUT /api/admin/connectors/[id]/templates (STORY-50): gating,
// validation, audit of the per-template enablement.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const setTemplateConnector = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-connectors', () => ({
  setTemplateConnector: (...a: unknown[]) => setTemplateConnector(...a),
}));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));

import { PUT } from './route';

const put = (body: unknown, id = 'c1') =>
  PUT(
    new Request(`http://localhost/api/admin/connectors/${id}/templates`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    { params: { id } } as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  setTemplateConnector.mockResolvedValue(true);
});

describe('PUT /api/admin/connectors/[id]/templates', () => {
  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await put({ templateId: 't', enabled: true })).status).toBe(403);
    expect(setTemplateConnector).not.toHaveBeenCalled();
  });

  it('400 without a templateId or enabled flag', async () => {
    expect((await put({ enabled: true })).status).toBe(400);
    expect((await put({ templateId: 't' })).status).toBe(400);
  });

  it('404 when the connector does not exist', async () => {
    setTemplateConnector.mockResolvedValue(false);
    expect((await put({ templateId: 't', enabled: true })).status).toBe(404);
  });

  it('enables for a template with allowed commands + audits', async () => {
    const res = await put({
      templateId: 'react-threejs-scene',
      enabled: true,
      allowedCommands: ['generate_image'],
    });
    expect(res.status).toBe(200);
    expect(setTemplateConnector).toHaveBeenCalledWith('c1', 'react-threejs-scene', {
      enabled: true,
      allowedCommands: ['generate_image'],
    });
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'connector.template_changed',
      expect.objectContaining({
        metadata: expect.objectContaining({ templateId: 'react-threejs-scene', enabled: true }),
      }),
    );
  });
});
