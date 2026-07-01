// Unit tests for DELETE /api/admin/blocklist/[id] (STORY-46).

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const removeBlocklistEntry = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-blocklist', () => ({
  removeBlocklistEntry: (...a: unknown[]) => removeBlocklistEntry(...a),
}));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));

import { DELETE } from './route';

const del = (id = 'b1') =>
  DELETE(
    new Request(`http://localhost/api/admin/blocklist/${id}`, { method: 'DELETE' }) as never,
    {
      params: { id },
    } as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  removeBlocklistEntry.mockResolvedValue({ value: 'spam@x.test' });
});

describe('DELETE /api/admin/blocklist/[id]', () => {
  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await del()).status).toBe(403);
    expect(removeBlocklistEntry).not.toHaveBeenCalled();
  });

  it('404 when the entry does not exist', async () => {
    removeBlocklistEntry.mockResolvedValue(null);
    expect((await del()).status).toBe(404);
  });

  it('removes the entry and audits', async () => {
    const res = await del('b1');
    expect(res.status).toBe(200);
    expect(removeBlocklistEntry).toHaveBeenCalledWith('b1');
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'blocklist.removed',
      expect.objectContaining({ targetId: 'b1', metadata: { value: 'spam@x.test' } }),
    );
  });
});
