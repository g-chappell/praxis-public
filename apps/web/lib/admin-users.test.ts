// Pure unit tests for admin user list query-param parsing (STORY-45). The
// DB-backed helpers are covered by admin-users.integration.test.ts.

import { describe, expect, it } from 'vitest';

import { parseAdminUserSort } from './admin-users';

describe('parseAdminUserSort', () => {
  it('passes through known sorts', () => {
    expect(parseAdminUserSort('oldest')).toBe('oldest');
    expect(parseAdminUserSort('email')).toBe('email');
  });

  it('defaults unknown / missing to recent', () => {
    expect(parseAdminUserSort('recent')).toBe('recent');
    expect(parseAdminUserSort('bogus')).toBe('recent');
    expect(parseAdminUserSort(null)).toBe('recent');
  });
});
