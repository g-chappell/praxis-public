// Pure helpers for the workspace file tree (TASK-031): turn the flat list of
// project-relative paths the orchestrator sends (file_tree / file_changed) into
// a nested, sorted tree the FileTree component renders. Kept framework-free so
// it's unit-testable under Vitest.

export interface TreeNode {
  /** Last path segment — the display label. */
  name: string;
  /** Full project-relative path (dir path for dirs, file path for files). */
  path: string;
  type: 'file' | 'dir';
  /** Present (possibly empty) only for directories. */
  children?: TreeNode[];
}

/** Build a sorted nested tree from flat paths. Directories sort before files,
 *  each group alphabetically. Intermediate directories are synthesised from the
 *  path segments (the orchestrator only sends file paths). */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const full of paths) {
    const parts = full.split('/').filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    let level = root;
    let acc = '';
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === part && n.type === (isFile ? 'file' : 'dir'));
      if (!node) {
        node = isFile
          ? { name: part, path: acc, type: 'file' }
          : { name: part, path: acc, type: 'dir', children: [] };
        level.push(node);
      }
      if (!isFile) level = node.children!;
    });
  }

  sortNodes(root);
  return root;
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) if (n.children) sortNodes(n.children);
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  glsl: 'plaintext',
};

/** Monaco language id for a path, inferred from its extension. */
export function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext';
}
