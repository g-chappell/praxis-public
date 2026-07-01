// Unit tests for the admin platform-keys route (STORY-21 / STORY-38). Mocks the
// auth/admin/keys/audit boundaries so we exercise the handler's branching:
// role-gating, per-provider format validation, set/rotate vs deactivate, and the
// "never return the raw key" contract.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const setActivePlatformKey = vi.fn();
const deactivateActivePlatformKey = vi.fn();
const getActivePlatformKeyMeta = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));
vi.mock('@praxis/keys', () => ({
  setActivePlatformKey: (...a: unknown[]) => setActivePlatformKey(...a),
  deactivateActivePlatformKey: (...a: unknown[]) => deactivateActivePlatformKey(...a),
  getActivePlatformKeyMeta: (...a: unknown[]) => getActivePlatformKeyMeta(...a),
}));

import { POST } from './route';

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/api-keys', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const callPost = (body: unknown) => POST(req(body) as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  getActivePlatformKeyMeta.mockResolvedValue({
    maskedKey: 'sk-…ABCD',
    createdAt: null,
    lastRotatedAt: null,
  });
});

describe('POST /api/admin/api-keys', () => {
  it('refuses a non-admin server-side (403, no key written)', async () => {
    isUserAdmin.mockResolvedValue(false);
    const res = await callPost({ key: 'sk-ant-abc', provider: 'anthropic' });
    expect(res.status).toBe(403);
    expect(setActivePlatformKey).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated request (401)', async () => {
    getSession.mockResolvedValue(null);
    const res = await callPost({ key: 'sk-ant-abc' });
    expect(res.status).toBe(401);
    expect(setActivePlatformKey).not.toHaveBeenCalled();
  });

  it('rejects an Anthropic key without the sk-ant- prefix (400)', async () => {
    const res = await callPost({ key: 'sk-wrong', provider: 'anthropic' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_key_format' });
    expect(setActivePlatformKey).not.toHaveBeenCalled();
  });

  it('accepts an OpenAI key (sk-proj- and sk- forms) and stores it for openai', async () => {
    for (const key of ['sk-proj-abc123', 'sk-abc123']) {
      const res = await callPost({ key, provider: 'openai' });
      expect(res.status).toBe(200);
      expect(setActivePlatformKey).toHaveBeenCalledWith(key, 'admin-1', 'openai');
    }
  });

  it('rejects an OpenAI key without the sk- prefix (400)', async () => {
    const res = await callPost({ key: 'nope-123', provider: 'openai' });
    expect(res.status).toBe(400);
    expect(setActivePlatformKey).not.toHaveBeenCalled();
  });

  it('defaults to the anthropic provider when none is given', async () => {
    const res = await callPost({ key: 'sk-ant-default' });
    expect(res.status).toBe(200);
    expect(setActivePlatformKey).toHaveBeenCalledWith('sk-ant-default', 'admin-1', 'anthropic');
  });

  it('never returns the raw key — only masked meta', async () => {
    const res = await callPost({ key: 'sk-ant-secret-RAW', provider: 'anthropic' });
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('sk-ant-secret-RAW');
    expect(text).toContain('sk-…ABCD');
  });

  it('deactivates a provider without requiring a key', async () => {
    const res = await callPost({ action: 'deactivate', provider: 'openai' });
    expect(res.status).toBe(200);
    expect(deactivateActivePlatformKey).toHaveBeenCalledWith('openai');
    expect(setActivePlatformKey).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ meta: null });
  });

  it('audits the rotation with the provider in metadata', async () => {
    await callPost({ key: 'sk-ant-abc', provider: 'anthropic' });
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'api_key.rotated',
      expect.objectContaining({ metadata: expect.objectContaining({ provider: 'anthropic' }) }),
    );
  });
});
