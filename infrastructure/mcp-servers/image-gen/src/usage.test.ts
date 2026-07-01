import { describe, expect, it, vi } from 'vitest';

import { checkUsageAllowed } from './usage.js';

describe('checkUsageAllowed (TASK-043)', () => {
  it('is uncapped (allowed) when no url/token is configured', async () => {
    expect(await checkUsageAllowed({ tool: 'generate_image' })).toEqual({ allowed: true });
    expect(await checkUsageAllowed({ url: 'http://o', tool: 'x' })).toEqual({ allowed: true });
  });

  it('allows when the orchestrator says allowed (and posts token + tool)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ allowed: true, count: 3, cap: 50 }) });
    expect(
      await checkUsageAllowed({
        url: 'http://o/usage',
        token: 't',
        tool: 'generate_image',
        fetchImpl,
      }),
    ).toEqual({ allowed: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://o/usage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 't', tool: 'generate_image' }),
      }),
    );
  });

  it('denies with a reason when the daily cap is reached', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ allowed: false, count: 50, cap: 50 }) });
    const v = await checkUsageAllowed({
      url: 'http://o',
      token: 't',
      tool: 'generate_image',
      fetchImpl,
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/cap reached \(50\/50\)/);
  });

  it('fails CLOSED on a non-2xx response or a network error', async () => {
    const non2xx = await checkUsageAllowed({
      url: 'http://o',
      token: 't',
      tool: 'x',
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    });
    expect(non2xx.allowed).toBe(false);
    const netErr = await checkUsageAllowed({
      url: 'http://o',
      token: 't',
      tool: 'x',
      fetchImpl: vi.fn().mockRejectedValue(new Error('econnrefused')),
    });
    expect(netErr.allowed).toBe(false);
    expect(netErr.reason).toMatch(/econnrefused/);
  });
});
