import { describe, expect, it } from 'vitest';

import { parseAdminEmails } from '../src/admin-seed.js';

describe('parseAdminEmails', () => {
  it('returns [] for unset/empty input', () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails(null)).toEqual([]);
    expect(parseAdminEmails('')).toEqual([]);
    expect(parseAdminEmails('   ')).toEqual([]);
  });

  it('splits on commas and whitespace, trims and lowercases', () => {
    expect(parseAdminEmails('A@X.com, b@y.com')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseAdminEmails('a@x.com\n b@y.com\t c@z.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
    ]);
  });

  it('drops entries without an @ and de-duplicates', () => {
    expect(parseAdminEmails('a@x.com, notanemail, a@x.com')).toEqual(['a@x.com']);
  });
});
