import { describe, expect, it } from 'vitest';

import { DEFAULT_TEMPLATE_ID, TEMPLATES, isTemplateId } from './templates';

describe('template registry', () => {
  it('has the two POC templates with the expected ids', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(['blank', 'react-threejs-scene']);
  });

  it('DEFAULT_TEMPLATE_ID is a known template', () => {
    expect(isTemplateId(DEFAULT_TEMPLATE_ID)).toBe(true);
  });

  it('isTemplateId accepts known ids and rejects everything else', () => {
    expect(isTemplateId('blank')).toBe(true);
    expect(isTemplateId('react-threejs-scene')).toBe(true);
    expect(isTemplateId('nope')).toBe(false);
    expect(isTemplateId('')).toBe(false);
    expect(isTemplateId(undefined)).toBe(false);
    expect(isTemplateId(42)).toBe(false);
  });
});
