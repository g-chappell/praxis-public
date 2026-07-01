// Pure unit tests for the sign-in gate helpers (STORY-46). signInBlockReason +
// revokeUserSessions (DB-backed) are covered by blocklist.integration.test.ts.

import { describe, expect, it } from 'vitest';

import { emailDomain, signInBlockMessage } from './blocklist';

describe('emailDomain', () => {
  it('returns the lowercased domain', () => {
    expect(emailDomain('Ada@Example.COM')).toBe('example.com');
  });
  it('returns empty for a malformed address', () => {
    expect(emailDomain('not-an-email')).toBe('');
  });
});

describe('signInBlockMessage', () => {
  it('distinguishes banned from blocklisted', () => {
    expect(signInBlockMessage('banned')).toContain('suspended');
    expect(signInBlockMessage('blocklisted')).toContain('isn’t permitted');
  });
});
