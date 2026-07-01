'use client';

import { useEffect, useMemo, useState } from 'react';

import { Monogram } from '@/components/ui/monogram';
import { type TreeNode, buildTree } from '@/components/workspace/file-tree-model';
import { useWorkspaceFiles } from '@/components/workspace/workspace-files';
import { useWorkspacePresence } from '@/components/workspace/workspace-presence';
import { type ServerFrame, useWorkspaceSocket } from '@/components/workspace/workspace-socket';
import { cn } from '@/lib/utils';

/** A file's lock for the tree: who holds it, and whether that's this client. */
export interface LockBadge {
  ownerName: string;
  isMine: boolean;
}

// The file tree pane (TASK-031): renders the sandbox's files (fed by the
// orchestrator over the socket) as collapsible folders + clickable files. Locked
// files show a 🔒 badge with the owner (STORY-11/TASK-034); a peer viewing a file
// shows their monogram; a file the assistant just wrote briefly flashes.
export function FileTree() {
  const { files, selectedPath, select } = useWorkspaceFiles();
  const { locks, members, myUserId } = useWorkspacePresence();
  const { subscribe } = useWorkspaceSocket();
  const tree = useMemo(() => buildTree(files), [files]);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  const lockByPath = useMemo(() => {
    const map = new Map<string, LockBadge>();
    for (const lock of locks) {
      const owner = members.find((m) => m.userId === lock.userId);
      const isMine = lock.userId === myUserId;
      map.set(lock.path, { ownerName: isMine ? 'you' : (owner?.userName ?? 'someone'), isMine });
    }
    return map;
  }, [locks, members, myUserId]);

  // Peers (not me) currently viewing each file → their initials on that row.
  const viewersByPath = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      if (!m.filePath || m.userId === myUserId) continue;
      const list = map.get(m.filePath) ?? [];
      if (!list.includes(m.userName)) list.push(m.userName);
      map.set(m.filePath, list);
    }
    return map;
  }, [members, myUserId]);

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
          lockByPath={lockByPath}
          viewersByPath={viewersByPath}
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
  lockByPath,
  viewersByPath,
  changed,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  lockByPath: Map<string, LockBadge>;
  viewersByPath: Map<string, string[]>;
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
                lockByPath={lockByPath}
                viewersByPath={viewersByPath}
                changed={changed}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const lock = lockByPath.get(node.path);
  const viewers = viewersByPath.get(node.path);
  return (
    <li>
      <button
        type="button"
        style={indent}
        onClick={() => onSelect(node.path)}
        title={lock ? `Locked by ${lock.ownerName}` : undefined}
        className={cn(
          'flex w-full items-center gap-1.5 py-0.5 pr-2 text-left hover:bg-accent',
          node.path === selectedPath && 'bg-accent font-semibold',
          changed.has(node.path) && 'file-just-changed',
        )}
      >
        <span className="truncate">{node.name}</span>
        {viewers?.map((name) => (
          <Monogram key={name} name={name} size="sm" className="size-4 text-[0.5rem]" />
        ))}
        {lock && (
          <span
            aria-label={`Locked by ${lock.ownerName}`}
            className={cn('shrink-0 text-xs', lock.isMine ? 'opacity-60' : 'text-stamp')}
          >
            🔒
          </span>
        )}
      </button>
    </li>
  );
}
