// Read-only git data for the workspace Git panel (STORY-16/TASK-045). Pure
// functions over `Sandbox.exec` (which runs `bash -lc <cmd>` in the project root,
// /workspace) so they're unit-testable with a fake sandbox — the transport lives
// in routes/git.ts. Every revision that reaches a git command is validated and
// every interpolated value is single-quoted, so a malicious `from`/`to` can't
// inject shell into the sandbox.

import type { Sandbox, SandboxHandle } from '@praxis/sandbox';

type ExecSandbox = Pick<Sandbox, 'exec'>;

/** Field/record separators for `git log --pretty` — control chars that can't
 *  appear in a commit subject/author, so parsing never collides with content. */
const FIELD = '\x1f';
const RECORD = '\x1e';

export class GitError extends Error {}

/** A git revision/ref as accepted from the client. Deliberately strict: SHAs,
 *  refs, and relative forms (HEAD, HEAD~1, abc^) only — no shell metacharacters,
 *  whitespace, or `..` range syntax. */
const REV_RE = /^[0-9A-Za-z._/~^-]{1,200}$/;

export function isValidRev(rev: string): boolean {
  return REV_RE.test(rev) && !rev.includes('..');
}

/** Single-quote a value for safe interpolation into a `bash -lc` command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function run(sandbox: ExecSandbox, handle: SandboxHandle, cmd: string): Promise<string> {
  const { exitCode, stdout, stderr } = await sandbox.exec(handle, cmd);
  if (exitCode !== 0) throw new GitError(stderr.trim() || `command failed: ${cmd}`);
  return stdout;
}

export interface Commit {
  sha: string;
  author: string;
  /** ISO-8601 author date. */
  date: string;
  message: string;
}

export interface StatusEntry {
  /** Two-char porcelain code, e.g. ` M`, `A `, `??`, `R `. */
  status: string;
  path: string;
}

export interface GitStatus {
  branch: string;
  entries: StatusEntry[];
}

export type DiffStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T';

export interface DiffFile {
  path: string;
  status: DiffStatus;
  /** True for binary files — content is omitted (Monaco can't diff bytes). */
  binary: boolean;
  /** File contents at `from` (empty for added files / binary). */
  oldContent: string;
  /** File contents at `to` (empty for deleted files / binary). */
  newContent: string;
}

export interface GitDiff {
  from: string;
  to: string;
  files: DiffFile[];
}

/** Current branch name. Detached HEAD reports `HEAD`. */
export async function gitBranch(sandbox: ExecSandbox, handle: SandboxHandle): Promise<string> {
  return (await run(sandbox, handle, 'git rev-parse --abbrev-ref HEAD')).trim();
}

/** The most recent `limit` commits (default 20), newest first. A repo with no
 *  commits yet returns []. */
export async function gitLog(
  sandbox: ExecSandbox,
  handle: SandboxHandle,
  limit = 20,
): Promise<Commit[]> {
  const n = Math.max(1, Math.min(Math.floor(limit) || 20, 200));
  const fmt = `%H${FIELD}%an${FIELD}%aI${FIELD}%s${RECORD}`;
  let out: string;
  try {
    out = await run(sandbox, handle, `git log -n ${n} --pretty=format:'${fmt}'`);
  } catch (err) {
    // Fresh repo with no commits — `git log` exits non-zero. Treat as empty.
    if (err instanceof GitError) return [];
    throw err;
  }
  return out
    .split(RECORD)
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.length > 0)
    .map((r) => {
      const [sha, author, date, message] = r.split(FIELD);
      return { sha: sha ?? '', author: author ?? '', date: date ?? '', message: message ?? '' };
    });
}

/** Working-tree status (porcelain v1) plus the current branch. */
export async function gitStatus(sandbox: ExecSandbox, handle: SandboxHandle): Promise<GitStatus> {
  const out = await run(sandbox, handle, 'git status --porcelain=v1 --branch');
  const lines = out.split('\n').filter((l) => l.length > 0);
  let branch = '';
  const entries: StatusEntry[] = [];
  for (const line of lines) {
    if (line.startsWith('##')) {
      // `## main...origin/main [ahead 1]` → take the local branch name.
      branch = line.slice(2).trim().split('...')[0]!.split(' ')[0]!;
      continue;
    }
    entries.push({ status: line.slice(0, 2), path: line.slice(3) });
  }
  return { branch, entries };
}

/** Per-file diff between two revisions, as old/new content for Monaco's diff
 *  editor (TASK-046). Binary files are flagged with content omitted. */
export async function gitDiff(
  sandbox: ExecSandbox,
  handle: SandboxHandle,
  from: string,
  to: string,
): Promise<GitDiff> {
  if (!isValidRev(from) || !isValidRev(to)) {
    throw new GitError('invalid revision');
  }

  // --name-status: status + path(s). -z: NUL-delimited so paths with spaces /
  // newlines are unambiguous. Format per record: "<code>\0<path>\0" and for
  // renames/copies "<code>\0<old>\0<new>\0".
  const nameStatus = await run(sandbox, handle, `git diff --name-status -z ${q(from)} ${q(to)}`);
  // --numstat -z: "<add>\t<del>\t<path>\0" ; binary files report "-\t-".
  const numstat = await run(sandbox, handle, `git diff --numstat -z ${q(from)} ${q(to)}`);
  const binaryPaths = parseBinaryPaths(numstat);

  const files: DiffFile[] = [];
  const tokens = nameStatus.split('\0');
  let i = 0;
  while (i < tokens.length) {
    const code = tokens[i];
    if (!code) break; // trailing empty after the final NUL
    const status = code[0] as DiffStatus;
    let path: string;
    if (status === 'R' || status === 'C') {
      // rename/copy: code, old, new
      path = tokens[i + 2] ?? '';
      i += 3;
    } else {
      path = tokens[i + 1] ?? '';
      i += 2;
    }
    if (!path) continue;
    const binary = binaryPaths.has(path);
    files.push({
      path,
      status,
      binary,
      oldContent: binary || status === 'A' ? '' : await showFile(sandbox, handle, from, path),
      newContent: binary || status === 'D' ? '' : await showFile(sandbox, handle, to, path),
    });
  }
  return { from, to, files };
}

/** Rewind the working tree + HEAD to `to` (STORY-16 revert). `git reset --hard`
 *  discards commits after `to` from the branch tip — recoverable via reflog, and
 *  guarded in the UI by a type-the-SHA confirmation. The sandbox file watcher
 *  broadcasts the resulting file changes to the room, so the editor refreshes.
 *  Returns the new HEAD sha. */
export async function gitRevert(
  sandbox: ExecSandbox,
  handle: SandboxHandle,
  to: string,
): Promise<{ head: string }> {
  if (!isValidRev(to)) throw new GitError('invalid revision');
  await run(sandbox, handle, `git reset --hard ${q(to)}`);
  const head = (await run(sandbox, handle, 'git rev-parse HEAD')).trim();
  return { head };
}

function parseBinaryPaths(numstatZ: string): Set<string> {
  const binary = new Set<string>();
  const tokens = numstatZ.split('\0').filter((t) => t.length > 0);
  for (const tok of tokens) {
    // Each token is "<add>\t<del>\t<path>"; renames emit an extra path token we
    // simply ignore (binary detection by add/del is enough).
    const parts = tok.split('\t');
    if (parts.length >= 3 && parts[0] === '-' && parts[1] === '-') {
      binary.add(parts[2]!);
    }
  }
  return binary;
}

/** `git show <rev>:<path>` → file contents, or '' if the blob doesn't exist at
 *  that revision (e.g. the file was added/removed on one side). */
async function showFile(
  sandbox: ExecSandbox,
  handle: SandboxHandle,
  rev: string,
  path: string,
): Promise<string> {
  try {
    return await run(sandbox, handle, `git show ${q(`${rev}:${path}`)}`);
  } catch {
    return '';
  }
}
