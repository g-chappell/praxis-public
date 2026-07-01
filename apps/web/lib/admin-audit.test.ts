// Pure unit tests for audit query-param parsing (STORY-47). adminQueryAudit is
// covered by admin-audit.integration.test.ts.

import { describe, expect, it } from 'vitest';

import { parseAuditAction, parseAuditLimit } from './admin-audit';

describe('parseAuditAction', () => {
  it('accepts a known action', () => {
    expect(parseAuditAction('project.deleted')).toBe('project.deleted');
    expect(parseAuditAction('user.banned')).toBe('user.banned');
  });
  it('rejects unknown / non-string', () => {
    expect(parseAuditAction('not.a.real.action')).toBeUndefined();
    expect(parseAuditAction(null)).toBeUndefined();
    expect(parseAuditAction(123)).toBeUndefined();
  });
});

describe('parseAuditLimit', () => {
  it('defaults and clamps', () => {
    expect(parseAuditLimit(null)).toBe(50);
    expect(parseAuditLimit('0')).toBe(50);
    expect(parseAuditLimit('-5')).toBe(50);
    expect(parseAuditLimit('25')).toBe(25);
    expect(parseAuditLimit('9999')).toBe(200); // MAX_LIMIT
  });
});
