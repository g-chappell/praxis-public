// Unit tests for GET/POST /api/admin/blocklist (STORY-46): role-gating, add +
// audit, validation, and the already-blocked conflict.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const listBlocklist = vi.fn();
const addBlocklistEntry = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-blocklist', () => ({
  listBlocklist: (...a: unknown[]) => listBlocklist(...a),
  addBlocklistEntry: (...a: unknown[]) => addBlocklistEntry(...a),
  normalizeBlocklistValue: (v: string) => v.trim().toLowerCase(),
}));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));

import { GET, POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/admin/blocklist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  listBlocklist.mockResolvedValue([]);
  addBlocklistEntry.mockResolvedValue({ id: 'b1', value: 'spam@x.test', isDomain: false });
});

describe('GET /api/admin/blocklist', () => {
  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await GET()).status).toBe(403);
    expect(listBlocklist).not.toHaveBeenCalled();
  });
  it('200 returns entries', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] });
  });
});

describe('POST /api/admin/blocklist', () => {
  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await post({ value: 'a@b.test' })).status).toBe(403);
    expect(addBlocklistEntry).not.toHaveBeenCalled();
  });

  it('400 for a value that is neither a valid email nor domain', async () => {
    expect((await post({ value: 'nonsense' })).status).toBe(400);
    expect(addBlocklistEntry).not.toHaveBeenCalled();
  });

  it('adds an email entry (inferred non-domain) and audits', async () => {
    const res = await post({ value: 'Spam@X.test', reason: 'abuse' });
    expect(res.status).toBe(201);
    expect(addBlocklistEntry).toHaveBeenCalledWith({
      value: 'spam@x.test',
      isDomain: false,
      reason: 'abuse',
      addedBy: 'admin-1',
    });
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'blocklist.added',
      expect.objectContaining({ metadata: expect.objectContaining({ value: 'spam@x.test' }) }),
    );
  });

  it('adds a domain entry when there is no @', async () => {
    addBlocklistEntry.mockResolvedValue({ id: 'b2', value: 'spam.test', isDomain: true });
    const res = await post({ value: 'spam.test' });
    expect(res.status).toBe(201);
    expect(addBlocklistEntry).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'spam.test', isDomain: true }),
    );
  });

  it('409 when the value is already blocklisted', async () => {
    addBlocklistEntry.mockResolvedValue(null);
    expect((await post({ value: 'dupe@x.test' })).status).toBe(409);
  });
});
