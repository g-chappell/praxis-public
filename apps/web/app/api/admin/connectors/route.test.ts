// Unit tests for GET/POST /api/admin/connectors (STORY-50): gating, validation,
// and audit. Credentials are never echoed.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const listConnectors = vi.fn();
const createConnector = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-connectors', () => ({
  listConnectors: (...a: unknown[]) => listConnectors(...a),
  createConnector: (...a: unknown[]) => createConnector(...a),
}));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));

import { GET, POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/admin/connectors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  listConnectors.mockResolvedValue([]);
  createConnector.mockResolvedValue({ id: 'c1' });
});

describe('GET /api/admin/connectors', () => {
  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await GET()).status).toBe(403);
    expect(listConnectors).not.toHaveBeenCalled();
  });
  it('200 returns the catalog', async () => {
    expect((await GET()).status).toBe(200);
  });
});

describe('POST /api/admin/connectors', () => {
  it('403 for a non-admin — never creates', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await post({ name: 'x', commandRef: 'image-gen' })).status).toBe(403);
    expect(createConnector).not.toHaveBeenCalled();
  });

  it('400 for a missing name', async () => {
    expect((await post({ commandRef: 'image-gen' })).status).toBe(400);
  });

  it('400 for an unknown command_ref (lib rejects)', async () => {
    createConnector.mockResolvedValue({ error: 'invalid_command_ref' });
    expect((await post({ name: 'x', commandRef: 'evil' })).status).toBe(400);
  });

  it('409 for a duplicate name', async () => {
    createConnector.mockResolvedValue({ error: 'name_taken' });
    expect((await post({ name: 'dupe', commandRef: 'image-gen' })).status).toBe(409);
  });

  it('201 creates + audits; response carries no credential', async () => {
    const res = await post({
      name: 'img',
      commandRef: 'image-gen',
      credential: 'sk-secret',
      usageCap: 10,
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(await res.json())).not.toContain('sk-secret');
    expect(createConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'img',
        commandRef: 'image-gen',
        credential: 'sk-secret',
        usageCap: 10,
      }),
      'admin-1',
    );
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'connector.created',
      expect.objectContaining({ metadata: expect.objectContaining({ hasCredential: true }) }),
    );
  });
});
