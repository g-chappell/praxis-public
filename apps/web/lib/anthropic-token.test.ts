import { describe, expect, it } from 'vitest';

import { isExpiringSoon } from './anthropic-token';

describe('isExpiringSoon', () => {
  const now = 1_000_000_000_000;

  it('returns false when no expiry is recorded', () => {
    expect(isExpiringSoon(null, now)).toBe(false);
  });

  it('returns false for a token comfortably in the future', () => {
    expect(isExpiringSoon(new Date(now + 5 * 60_000), now)).toBe(false);
  });

  it('returns true within the 60s skew window', () => {
    expect(isExpiringSoon(new Date(now + 30_000), now)).toBe(true);
  });

  it('returns true for an already-expired token', () => {
    expect(isExpiringSoon(new Date(now - 1), now)).toBe(true);
  });
});
