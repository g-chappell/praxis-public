// Pure unit tests for the admin project list query-param parsing (STORY-44).
// The DB-backed adminListProjects is covered by admin-projects.integration.test.ts.

import { describe, expect, it } from 'vitest';

import { parseAdminProjectSort } from './admin-projects';

describe('parseAdminProjectSort', () => {
  it('passes through the known sorts', () => {
    expect(parseAdminProjectSort('oldest')).toBe('oldest');
    expect(parseAdminProjectSort('name')).toBe('name');
    expect(parseAdminProjectSort('activity')).toBe('activity');
  });

  it('defaults unknown / missing to recent', () => {
    expect(parseAdminProjectSort('recent')).toBe('recent');
    expect(parseAdminProjectSort('bogus')).toBe('recent');
    expect(parseAdminProjectSort(null)).toBe('recent');
    expect(parseAdminProjectSort(undefined)).toBe('recent');
  });
});
