import { describe, expect, it } from 'vitest';

import { NoPlatformKeyError, maskKey } from './platform-keys';

describe('maskKey', () => {
  it('keeps the provider prefix and last 4 for a normal key', () => {
    expect(maskKey('sk-ant-api03-abcdefABCD12')).toBe('sk-ant-…CD12');
  });

  it('only reveals the last 4 for a short key', () => {
    expect(maskKey('abcd1234')).toBe('…1234');
  });
});

describe('NoPlatformKeyError', () => {
  it('is named and carries a clear message', () => {
    const err = new NoPlatformKeyError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('NoPlatformKeyError');
    expect(err.message).toMatch(/no active platform api key/i);
  });
});
