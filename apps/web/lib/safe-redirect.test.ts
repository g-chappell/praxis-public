import { describe, expect, it } from 'vitest';

import { safeNextPath } from './safe-redirect';

describe('safeNextPath', () => {
  it('keeps a root-relative path', () => {
    expect(safeNextPath('/invite/abc123')).toBe('/invite/abc123');
    expect(safeNextPath('/projects/p1')).toBe('/projects/p1');
  });

  it('falls back for empty / absolute / protocol-relative / backslash inputs', () => {
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
    expect(safeNextPath('https://evil.com')).toBe('/dashboard');
    expect(safeNextPath('//evil.com')).toBe('/dashboard');
    expect(safeNextPath('/\\evil.com')).toBe('/dashboard');
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard');
  });

  it('honours a custom fallback', () => {
    expect(safeNextPath(null, '/signin')).toBe('/signin');
  });
});
