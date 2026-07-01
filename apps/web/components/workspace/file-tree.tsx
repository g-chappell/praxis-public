'use client';

import { useEffect, useMemo, useState } from 'react';

import { type TreeNode, buildTree } from '@/components/workspace/file-tree-model';
import { useWorkspaceFiles } from '@/components/workspace/workspace-files';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';
import { cn } from '@/lib/utils';

// The file tree pane: renders the sandbox's files (fed by the orchestrator over
// the socket) as collapsible folders + clickable files. A file the assistant
// just wrote briefly flashes.
export function FileTree() {
  const { files, selectedPath, select } = useWorkspaceFiles();
  const { subscribe } = useWorkspaceSocket();
  const tree = useMemo(() => buildTree(files), [files]);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  // Flash a file the moment the agent writes it (existing file_changed frame; no
  // backend work). The class is cleared after the animation so it can re-fire.
  useEffect(() => {
    return subscribe((frame: ServerFrame) => {
      if (frame.type !== 'file_changed') return;
      const path = typeof frame.path === 'string' ? frame.path : null;
      if (!path || frame.change === 'delete') return;
      setChanged((prev) => new Set(prev).add(path));
      window.setTimeout(() => {
        setChanged((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }, 1600);
    });
  }, [subscribe]);

  if (files.length === 0) {
    return <div className="p-3 text-xs italic text-muted-foreground">No files yet</div>;
  }

  return (
    <ul className="py-1 text-sm">
      {tree.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={select}
          changed={changed}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  depth,
  selectedPath,
  onSelect,
  changed,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  changed: Set<string>;
}) {
  const [open, setOpen] = useState(true);
  const indent = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === 'dir') {
    return (
      <li>
        <button
          type="button"
          style={indent}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1 py-0.5 pr-2 text-left font-mono text-xs uppercase tracking-wide text-muted-foreground hover:bg-accent"
        >
          <span className="w-3 shrink-0 text-xs">{open ? '▾' : '▸'}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <ul>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                changed={changed}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        style={indent}
        onClick={() => onSelect(node.path)}
        className={cn(
          'flex w-full items-center gap-1.5 py-0.5 pr-2 text-left hover:bg-accent',
          node.path === selectedPath && 'bg-accent font-semibold',
          changed.has(node.path) && 'file-just-changed',
        )}
      >
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  );
}
