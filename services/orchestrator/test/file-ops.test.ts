// Unit tests for the workspace file handlers (TASK-031). Node-compatible: a
// fake sandbox stands in for Docker, and a `sent` array captures the outbound
// frames. The real edit-save-refresh round-trip is proven by the Docker-gated
// WS integration test.

import { describe, expect, it, vi } from 'vitest';

import type { SandboxHandle } from '@praxis/sandbox';

import { handleFileList, handleFileRead, handleFileSave, safeRelPath } from '../src/file-ops';
import { logger } from '../src/logger';

const HANDLE: SandboxHandle = { projectId: 'p1', containerId: 'c1' };

function collector() {
  const sent: unknown[] = [];
  return { sent, send: (p: unknown) => void sent.push(p) };
}

describe('safeRelPath', () => {
  it('accepts a project-relative path', () => {
    expect(safeRelPath('src/index.ts')).toBe('src/index.ts');
  });

  it('rejects absolute paths, traversal, empties, and non-strings', () => {
    expect(safeRelPath('/etc/passwd')).toBeNull();
    expect(safeRelPath('../secret')).toBeNull();
    expect(safeRelPath('src/../../etc')).toBeNull();
    expect(safeRelPath('')).toBeNull();
    expect(safeRelPath(42)).toBeNull();
    expect(safeRelPath(undefined)).toBeNull();
  });
});

describe('handleFileList', () => {
  it('parses git ls-files stdout into a trimmed, non-empty path list', async () => {
    const exec = vi.fn(async () => ({ exitCode: 0, stdout: 'a.ts\nsrc/b.ts\n\n', stderr: '' }));
    const { sent, send } = collector();
    await handleFileList(send, { exec } as never, HANDLE);
    expect(exec).toHaveBeenCalledWith(HANDLE, 'git ls-files --cached --others --exclude-standard');
    expect(sent).toEqual([{ type: 'file_tree', paths: ['a.ts', 'src/b.ts'] }]);
  });

  it('emits file_list_failed when exec throws', async () => {
    const exec = vi.fn(async () => {
      throw new Error('no repo');
    });
    const { sent, send } = collector();
    await handleFileList(send, { exec } as never, HANDLE);
    expect(sent).toEqual([{ type: 'error', reason: 'file_list_failed' }]);
  });
});

describe('handleFileRead', () => {
  it('returns file_contents for a readable file', async () => {
    const readFile = vi.fn(async () => 'hello\n');
    const { sent, send } = collector();
    await handleFileRead(send, { readFile } as never, HANDLE, 'src/a.ts');
    expect(readFile).toHaveBeenCalledWith(HANDLE, 'src/a.ts');
    expect(sent).toEqual([{ type: 'file_contents', path: 'src/a.ts', content: 'hello\n' }]);
  });

  it('rejects an unsafe path before touching the sandbox', async () => {
    const readFile = vi.fn();
    const { sent, send } = collector();
    await handleFileRead(send, { readFile } as never, HANDLE, '../escape');
    expect(readFile).not.toHaveBeenCalled();
    expect(sent).toEqual([{ type: 'error', reason: 'bad_path' }]);
  });

  it('emits read_failed when the file is missing', async () => {
    const readFile = vi.fn(async () => {
      throw new Error('file not found');
    });
    const { sent, send } = collector();
    await handleFileRead(send, { readFile } as never, HANDLE, 'missing.ts');
    expect(sent).toEqual([{ type: 'error', reason: 'read_failed', path: 'missing.ts' }]);
  });
});

describe('handleFileSave', () => {
  it('writes the content and acks file_saved', async () => {
    const writeFile = vi.fn(async () => {});
    const { sent, send } = collector();
    await handleFileSave(send, { writeFile } as never, HANDLE, 'src/a.ts', 'new body');
    expect(writeFile).toHaveBeenCalledWith(HANDLE, 'src/a.ts', 'new body');
    expect(sent).toEqual([{ type: 'file_saved', path: 'src/a.ts' }]);
  });

  it('rejects an unsafe path and non-string content', async () => {
    const writeFile = vi.fn();
    const bad = collector();
    await handleFileSave(bad.send, { writeFile } as never, HANDLE, '/abs', 'x');
    expect(bad.sent).toEqual([{ type: 'error', reason: 'bad_path' }]);

    const notString = collector();
    await handleFileSave(notString.send, { writeFile } as never, HANDLE, 'ok.ts', 123 as never);
    expect(notString.sent).toEqual([{ type: 'error', reason: 'bad_content', path: 'ok.ts' }]);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('emits save_failed when the write throws', async () => {
    const writeFile = vi.fn(async () => {
      throw new Error('disk full');
    });
    const { sent, send } = collector();
    await handleFileSave(send, { writeFile } as never, HANDLE, 'a.ts', 'body');
    expect(sent).toEqual([{ type: 'error', reason: 'save_failed', path: 'a.ts' }]);
  });
});

describe('failure logging (TASK-069)', () => {
  it('logs the underlying error with projectId + path on save failure', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const writeFile = vi.fn(async () => {
        throw new Error('501 unsupported transfer encoding');
      });
      await handleFileSave(collector().send, { writeFile } as never, HANDLE, 'src/a.ts', 'x');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          err: '501 unsupported transfer encoding',
          projectId: 'p1',
          path: 'src/a.ts',
        }),
        'file_ops.save_failed',
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('logs on read failure too', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    try {
      const readFile = vi.fn(async () => {
        throw new Error('file not found');
      });
      await handleFileRead(collector().send, { readFile } as never, HANDLE, 'missing.ts');
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ err: 'file not found', projectId: 'p1', path: 'missing.ts' }),
        'file_ops.read_failed',
      );
    } finally {
      spy.mockRestore();
    }
  });
});
