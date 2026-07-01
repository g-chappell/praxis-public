import { describe, expect, it } from 'vitest';

import type { ExecResult, SandboxHandle } from '@praxis/sandbox';

import { gitBranch, gitDiff, gitLog, gitRevert, gitStatus, isValidRev } from '../src/git';

const handle: SandboxHandle = { projectId: 'p1', containerId: 'c1' };

/** Fake sandbox that maps an exec command (matched by substring) to canned
 *  output. Records the commands it was asked to run. */
function fakeExec(routes: Array<{ match: string; result: Partial<ExecResult> }>) {
  const calls: string[] = [];
  return {
    calls,
    async exec(_h: SandboxHandle, cmd: string): Promise<ExecResult> {
      calls.push(cmd);
      const hit = routes.find((r) => cmd.includes(r.match));
      const r = hit?.result ?? {};
      return { exitCode: r.exitCode ?? 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    },
  };
}

const FIELD = '\x1f';
const RECORD = '\x1e';

describe('isValidRev', () => {
  it('accepts SHAs, refs, and relative forms', () => {
    for (const r of ['HEAD', 'HEAD~1', 'abc123^', 'main', 'feature/x', 'a1b2c3d']) {
      expect(isValidRev(r)).toBe(true);
    }
  });
  it('rejects shell metacharacters, whitespace, and ranges', () => {
    for (const r of ['a; rm -rf /', '$(whoami)', 'a b', 'a..b', '`id`', 'a|b', '']) {
      expect(isValidRev(r)).toBe(false);
    }
  });
});

describe('gitBranch', () => {
  it('returns the trimmed current branch', async () => {
    const sb = fakeExec([{ match: 'rev-parse --abbrev-ref', result: { stdout: 'main\n' } }]);
    expect(await gitBranch(sb, handle)).toBe('main');
  });
});

describe('gitLog', () => {
  it('parses commits into structured records', async () => {
    const rec = (sha: string, an: string, date: string, msg: string) =>
      `${sha}${FIELD}${an}${FIELD}${date}${FIELD}${msg}${RECORD}`;
    const stdout =
      rec('sha1', 'Ada', '2026-06-06T10:00:00Z', 'first') +
      '\n' +
      rec('sha2', 'Bo', '2026-06-06T11:00:00Z', 'second');
    const sb = fakeExec([{ match: 'git log', result: { stdout } }]);
    const log = await gitLog(sb, handle, 20);
    expect(log).toEqual([
      { sha: 'sha1', author: 'Ada', date: '2026-06-06T10:00:00Z', message: 'first' },
      { sha: 'sha2', author: 'Bo', date: '2026-06-06T11:00:00Z', message: 'second' },
    ]);
  });

  it('returns [] for a fresh repo with no commits (git log exits non-zero)', async () => {
    const sb = fakeExec([
      { match: 'git log', result: { exitCode: 128, stderr: 'does not have any commits yet' } },
    ]);
    expect(await gitLog(sb, handle)).toEqual([]);
  });

  it('clamps the limit into git log -n', async () => {
    const sb = fakeExec([{ match: 'git log', result: { stdout: '' } }]);
    await gitLog(sb, handle, 9999);
    expect(sb.calls.some((c) => c.includes('git log -n 200'))).toBe(true);
  });
});

describe('gitStatus', () => {
  it('parses the branch header and porcelain entries', async () => {
    const stdout =
      ['## main...origin/main [ahead 1]', ' M src/a.ts', '?? new.txt'].join('\n') + '\n';
    const sb = fakeExec([{ match: 'git status', result: { stdout } }]);
    const status = await gitStatus(sb, handle);
    expect(status.branch).toBe('main');
    expect(status.entries).toEqual([
      { status: ' M', path: 'src/a.ts' },
      { status: '??', path: 'new.txt' },
    ]);
  });
});

describe('gitDiff', () => {
  it('rejects invalid revisions before running git', async () => {
    const sb = fakeExec([]);
    await expect(gitDiff(sb, handle, 'a; rm -rf /', 'HEAD')).rejects.toThrow('invalid revision');
    expect(sb.calls).toHaveLength(0);
  });

  it('returns old/new content for modified, added, and deleted files', async () => {
    const nameStatus = ['M\0src/mod.ts\0', 'A\0src/add.ts\0', 'D\0src/del.ts\0'].join('');
    const numstat = ['1\t1\tsrc/mod.ts\0', '5\t0\tsrc/add.ts\0', '0\t3\tsrc/del.ts\0'].join('');
    const sb = fakeExec([
      { match: '--name-status', result: { stdout: nameStatus } },
      { match: '--numstat', result: { stdout: numstat } },
      { match: "show 'HEAD~1:src/mod.ts'", result: { stdout: 'old-mod\n' } },
      { match: "show 'HEAD:src/mod.ts'", result: { stdout: 'new-mod\n' } },
      { match: "show 'HEAD:src/add.ts'", result: { stdout: 'added\n' } },
      { match: "show 'HEAD~1:src/del.ts'", result: { stdout: 'deleted\n' } },
    ]);
    const diff = await gitDiff(sb, handle, 'HEAD~1', 'HEAD');
    expect(diff.from).toBe('HEAD~1');
    expect(diff.to).toBe('HEAD');
    expect(diff.files).toEqual([
      {
        path: 'src/mod.ts',
        status: 'M',
        binary: false,
        oldContent: 'old-mod\n',
        newContent: 'new-mod\n',
      },
      { path: 'src/add.ts', status: 'A', binary: false, oldContent: '', newContent: 'added\n' },
      { path: 'src/del.ts', status: 'D', binary: false, oldContent: 'deleted\n', newContent: '' },
    ]);
  });

  it('flags binary files and omits their content', async () => {
    const nameStatus = 'M\0public/textures/stone.png\0';
    const numstat = '-\t-\tpublic/textures/stone.png\0';
    const sb = fakeExec([
      { match: '--name-status', result: { stdout: nameStatus } },
      { match: '--numstat', result: { stdout: numstat } },
    ]);
    const diff = await gitDiff(sb, handle, 'HEAD~1', 'HEAD');
    expect(diff.files).toEqual([
      {
        path: 'public/textures/stone.png',
        status: 'M',
        binary: true,
        oldContent: '',
        newContent: '',
      },
    ]);
    // No `git show` is attempted for a binary file.
    expect(sb.calls.some((c) => c.includes('git show'))).toBe(false);
  });

  it('handles renames (path = new name)', async () => {
    const nameStatus = 'R100\0src/old.ts\0src/new.ts\0';
    const numstat = '0\t0\tsrc/old.ts\0src/new.ts\0';
    const sb = fakeExec([
      { match: '--name-status', result: { stdout: nameStatus } },
      { match: '--numstat', result: { stdout: numstat } },
      { match: "show 'HEAD~1:src/new.ts'", result: { stdout: 'content\n' } },
      { match: "show 'HEAD:src/new.ts'", result: { stdout: 'content\n' } },
    ]);
    const diff = await gitDiff(sb, handle, 'HEAD~1', 'HEAD');
    expect(diff.files.map((f) => ({ path: f.path, status: f.status }))).toEqual([
      { path: 'src/new.ts', status: 'R' },
    ]);
  });
});

describe('gitRevert', () => {
  it('runs reset --hard to the (quoted) target and returns the new HEAD', async () => {
    const sb = fakeExec([
      { match: 'reset --hard', result: { stdout: '' } },
      { match: 'rev-parse HEAD', result: { stdout: 'newhead\n' } },
    ]);
    const result = await gitRevert(sb, handle, 'abc123');
    expect(result).toEqual({ head: 'newhead' });
    expect(sb.calls.some((c) => c.includes("git reset --hard 'abc123'"))).toBe(true);
  });

  it('rejects an invalid revision before running git', async () => {
    const sb = fakeExec([]);
    await expect(gitRevert(sb, handle, 'a; rm -rf /')).rejects.toThrow('invalid revision');
    expect(sb.calls).toHaveLength(0);
  });
});
