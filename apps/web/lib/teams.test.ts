// Pure validation tests for team-name parsing (STORY-54). No DB — persistence
// lives in teams.integration.test.ts.

import { describe, expect, it } from 'vitest';

import { TEAM_NAME_MAX, parseTeamName } from './teams';

describe('parseTeamName', () => {
  it('accepts a non-empty name and returns it trimmed', () => {
    expect(parseTeamName('  Acme Labs  ')).toEqual({ name: 'Acme Labs' });
  });

  it('accepts a name at exactly the max length', () => {
    const name = 'a'.repeat(TEAM_NAME_MAX);
    expect(parseTeamName(name)).toEqual({ name });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(parseTeamName('')).toEqual({ error: 'invalid_name' });
    expect(parseTeamName('   ')).toEqual({ error: 'invalid_name' });
  });

  it('rejects a name longer than the max after trim', () => {
    expect(parseTeamName('a'.repeat(TEAM_NAME_MAX + 1))).toEqual({ error: 'invalid_name' });
  });

  it('rejects non-string input', () => {
    expect(parseTeamName(undefined)).toEqual({ error: 'invalid_name' });
    expect(parseTeamName(42)).toEqual({ error: 'invalid_name' });
    expect(parseTeamName(null)).toEqual({ error: 'invalid_name' });
  });
});
