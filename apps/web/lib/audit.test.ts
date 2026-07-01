// Unit tests for recordAudit's best-effort contract (STORY-43): a successful
// insert forwards the right values; a failing insert is swallowed (logged, not
// thrown) so the caller's action is never broken. The real-Postgres persistence
// + query-dimension coverage lives in audit.integration.test.ts (TASK-124).

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '@praxis/db/client';

import { clientIp, recordAudit } from './audit';

/** A fake db whose insert(...).values(...) runs `onValues`. */
function fakeDb(onValues: (v: unknown) => unknown): Database {
  return {
    insert: () => ({ values: async (v: unknown) => onValues(v) }),
  } as unknown as Database;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('recordAudit', () => {
  it('forwards actor, action, target, metadata, and ip to the insert', async () => {
    let captured: Record<string, unknown> | undefined;
    await recordAudit(
      'actor-1',
      'project.deleted',
      { targetType: 'project', targetId: 'proj-9', metadata: { fields: ['name'] }, ip: '1.2.3.4' },
      fakeDb((v) => {
        captured = v as Record<string, unknown>;
      }),
    );
    expect(captured).toMatchObject({
      actorUserId: 'actor-1',
      action: 'project.deleted',
      targetType: 'project',
      targetId: 'proj-9',
      metadata: { fields: ['name'] },
      ip: '1.2.3.4',
    });
  });

  it('defaults metadata and ip to null when omitted', async () => {
    let captured: Record<string, unknown> | undefined;
    await recordAudit(
      'actor-1',
      'api_key.rotated',
      { targetType: 'platform_api_key', targetId: 'platform' },
      fakeDb((v) => {
        captured = v as Record<string, unknown>;
      }),
    );
    expect(captured).toMatchObject({ metadata: null, ip: null });
  });

  it('swallows an insert failure (logs, never throws)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      recordAudit(
        'actor-1',
        'project.updated',
        { targetType: 'project', targetId: 'proj-9' },
        fakeDb(() => {
          throw new Error('db down');
        }),
      ),
    ).resolves.toBeUndefined();
    expect(err).toHaveBeenCalledOnce();
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const h = new Headers({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' });
    expect(clientIp(h)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '8.8.8.8' });
    expect(clientIp(h)).toBe('8.8.8.8');
  });

  it('returns null when no proxy headers are present', () => {
    expect(clientIp(new Headers())).toBeNull();
  });
});
