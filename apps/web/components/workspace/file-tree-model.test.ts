import { describe, expect, it } from 'vitest';

import { buildTree, languageFromPath } from './file-tree-model';

describe('buildTree', () => {
  it('nests paths and synthesises intermediate directories', () => {
    const tree = buildTree(['src/index.ts', 'src/lib/util.ts', 'README.md']);
    // dirs sort before files: src/ then README.md
    expect(tree.map((n) => `${n.type}:${n.name}`)).toEqual(['dir:src', 'file:README.md']);

    const src = tree[0]!;
    expect(src.path).toBe('src');
    expect(src.children!.map((n) => `${n.type}:${n.path}`)).toEqual([
      'dir:src/lib',
      'file:src/index.ts',
    ]);
    expect(src.children![0]!.children).toEqual([
      { name: 'util.ts', path: 'src/lib/util.ts', type: 'file' },
    ]);
  });

  it('sorts directories before files, each alphabetically', () => {
    const tree = buildTree(['b.ts', 'a.ts', 'z/one.ts', 'm/two.ts']);
    expect(tree.map((n) => n.name)).toEqual(['m', 'z', 'a.ts', 'b.ts']);
  });

  it('does not duplicate a directory shared by sibling files', () => {
    const tree = buildTree(['src/a.ts', 'src/b.ts']);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children!.map((n) => n.name)).toEqual(['a.ts', 'b.ts']);
  });

  it('ignores empty input and blank segments', () => {
    expect(buildTree([])).toEqual([]);
    expect(buildTree(['a//b.ts'])[0]!.children![0]!.path).toBe('a/b.ts');
  });
});

describe('languageFromPath', () => {
  it('maps known extensions and falls back to plaintext', () => {
    expect(languageFromPath('src/main.tsx')).toBe('typescript');
    expect(languageFromPath('a.js')).toBe('javascript');
    expect(languageFromPath('package.json')).toBe('json');
    expect(languageFromPath('README.md')).toBe('markdown');
    expect(languageFromPath('shader.glsl')).toBe('plaintext');
    expect(languageFromPath('LICENSE')).toBe('plaintext');
  });
});
