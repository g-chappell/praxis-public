// Unit tests for the PATCH /api/projects/[id] boundary validator (STORY-39).
// Pure — no DB, runs in CI. Ownership + persistence are covered by
// projects.integration.test.ts (RUN_DB_TESTS=1).

import { describe, expect, it } from 'vitest';

import {
  BUDGET_MAX_USD,
  DESCRIPTION_MAX,
  NAME_MAX,
  parseBudgetUsd,
  parseProjectPatch,
  parseProjectSort,
  parseProjectStatus,
} from './projects';

describe('parseBudgetUsd', () => {
  it('normalizes a valid number/string to 2 decimals', () => {
    expect(parseBudgetUsd(10)).toBe('10.00');
    expect(parseBudgetUsd('25.5')).toBe('25.50');
    expect(parseBudgetUsd(0)).toBe('0.00');
  });
  it('rejects negatives, NaN, and over-max', () => {
    expect(parseBudgetUsd(-1)).toBeNull();
    expect(parseBudgetUsd('abc')).toBeNull();
    expect(parseBudgetUsd(BUDGET_MAX_USD + 1)).toBeNull();
    expect(parseBudgetUsd(null)).toBeNull();
  });
});

describe('parseProjectPatch', () => {
  it('accepts a valid name + description and forwards them untrimmed', () => {
    const r = parseProjectPatch({ name: '  New name ', description: ' hi ' });
    expect(r).toEqual({ fields: { name: '  New name ', description: ' hi ' } });
  });

  it('accepts a name-only patch', () => {
    expect(parseProjectPatch({ name: 'Just a name' })).toEqual({
      fields: { name: 'Just a name' },
    });
  });

  it('accepts an empty-string description (clears it downstream)', () => {
    expect(parseProjectPatch({ description: '' })).toEqual({ fields: { description: '' } });
  });

  it('rejects an empty / whitespace-only name', () => {
    expect(parseProjectPatch({ name: '   ' })).toEqual({ error: 'invalid_name' });
  });

  it('rejects a non-string name', () => {
    expect(parseProjectPatch({ name: 42 })).toEqual({ error: 'invalid_name' });
  });

  it('rejects a name over NAME_MAX chars', () => {
    expect(parseProjectPatch({ name: 'x'.repeat(NAME_MAX + 1) })).toEqual({
      error: 'invalid_name',
    });
  });

  it('rejects a description over DESCRIPTION_MAX chars', () => {
    expect(parseProjectPatch({ description: 'x'.repeat(DESCRIPTION_MAX + 1) })).toEqual({
      error: 'invalid_description',
    });
  });

  it('rejects an empty patch (no fields)', () => {
    expect(parseProjectPatch({})).toEqual({ error: 'no_fields' });
    expect(parseProjectPatch(null)).toEqual({ error: 'no_fields' });
  });
});

describe('parseProjectStatus', () => {
  it('passes through archived and all', () => {
    expect(parseProjectStatus('archived')).toBe('archived');
    expect(parseProjectStatus('all')).toBe('all');
  });

  it('defaults anything else (incl. null / unknown) to active', () => {
    expect(parseProjectStatus('active')).toBe('active');
    expect(parseProjectStatus(null)).toBe('active');
    expect(parseProjectStatus('bogus')).toBe('active');
    expect(parseProjectStatus(undefined)).toBe('active');
  });
});

describe('parseProjectSort', () => {
  it('passes through oldest and name', () => {
    expect(parseProjectSort('oldest')).toBe('oldest');
    expect(parseProjectSort('name')).toBe('name');
  });

  it('defaults anything else (incl. null / unknown) to recent', () => {
    expect(parseProjectSort('recent')).toBe('recent');
    expect(parseProjectSort(null)).toBe('recent');
    expect(parseProjectSort('bogus')).toBe('recent');
    expect(parseProjectSort(undefined)).toBe('recent');
  });
});
