// Workspace file operations over the session socket (TASK-031). Kept separate
// from routes/ws.ts so they're unit-testable under Node/Vitest (ws.ts imports
// hono/bun, which only loads under Bun). Each handler takes an explicit `send`
// sink and the sandbox + handle, so tests inject a fake sandbox and assert the
// outbound frames.

import type { Sandbox, SandboxHandle } from '@praxis/sandbox';

import { logger } from './logger';

type Send = (payload: unknown) => void;
type FileSandbox = Pick<Sandbox, 'exec' | 'readFile' | 'writeFile'>;

/** Boundary guard for client-supplied paths: project-relative only — no absolute
 *  paths and no `..` traversal out of /workspace. Returns the path or null. */
export function safeRelPath(p: unknown): string | null {
  if (typeof p !== 'string' || p.length === 0) return null;
  if (p.startsWith('/')) return null;
  if (p.split('/').some((seg) => seg === '..')) return null;
  return p;
}

/** Seed the file tree: tracked + untracked-non-ignored files (so .git/ and
 *  gitignored node_modules drop out, and the list stays bounded). The sandbox
 *  git-inits /workspace on start, so this is always a repo. */
export async function handleFileList(
  send: Send,
  sandbox: FileSandbox,
  handle: SandboxHandle,
): Promise<void> {
  try {
    const res = await sandbox.exec(handle, 'git ls-files --cached --others --exclude-standard');
    const paths = res.stdout
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    send({ type: 'file_tree', paths });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), projectId: handle.projectId },
      'file_ops.list_failed',
    );
    send({ type: 'error', reason: 'file_list_failed' });
  }
}

/** Open a file: stream its UTF-8 contents back to the requesting socket. */
export async function handleFileRead(
  send: Send,
  sandbox: FileSandbox,
  handle: SandboxHandle,
  pathRaw: unknown,
): Promise<void> {
  const path = safeRelPath(pathRaw);
  if (!path) {
    send({ type: 'error', reason: 'bad_path' });
    return;
  }
  try {
    const content = await sandbox.readFile(handle, path);
    send({ type: 'file_contents', path, content });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), projectId: handle.projectId, path },
      'file_ops.read_failed',
    );
    send({ type: 'error', reason: 'read_failed', path });
  }
}

/** Save a file back to the sandbox. The watcher separately broadcasts the
 *  resulting file_changed to the room; this just acks the writer. */
export async function handleFileSave(
  send: Send,
  sandbox: FileSandbox,
  handle: SandboxHandle,
  pathRaw: unknown,
  content: unknown,
): Promise<void> {
  const path = safeRelPath(pathRaw);
  if (!path) {
    send({ type: 'error', reason: 'bad_path' });
    return;
  }
  if (typeof content !== 'string') {
    send({ type: 'error', reason: 'bad_content', path });
    return;
  }
  try {
    await sandbox.writeFile(handle, path, content);
    send({ type: 'file_saved', path });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), projectId: handle.projectId, path },
      'file_ops.save_failed',
    );
    send({ type: 'error', reason: 'save_failed', path });
  }
}
