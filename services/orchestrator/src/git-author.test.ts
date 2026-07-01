import { describe, expect, it, vi } from 'vitest';

import type { Sandbox, SandboxHandle } from '@praxis/sandbox';

import {
  DEFAULT_GIT_IDENTITY,
  commitMessageFromPrompt,
  commitTurnWork,
  gitIdentity,
} from './git-author';

describe('gitIdentity', () => {
  const prompter = { displayName: 'Ada Lovelace', email: 'ada@example.com' };
  const owner = { displayName: 'Graham Chappell', email: 'graham@example.com' };

  it('attributes to the prompting user when resolvable', () => {
    expect(gitIdentity(prompter, owner)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
  });

  it('falls back to the project owner when the prompter is unknown', () => {
    expect(gitIdentity(undefined, owner)).toEqual({
      name: 'Graham Chappell',
      email: 'graham@example.com',
    });
  });

  it('falls back to the owner when the prompter row has no email', () => {
    expect(gitIdentity({ displayName: 'Nameless', email: null }, owner)).toEqual({
      name: 'Graham Chappell',
      email: 'graham@example.com',
    });
  });

  it('falls back to the Praxis default when neither resolves', () => {
    expect(gitIdentity(undefined, undefined)).toEqual(DEFAULT_GIT_IDENTITY);
  });

  it('uses the email as the name when displayName is empty', () => {
    expect(gitIdentity({ displayName: '  ', email: 'solo@example.com' })).toEqual({
      name: 'solo@example.com',
      email: 'solo@example.com',
    });
  });
});

describe('commitMessageFromPrompt', () => {
  it('uses the first non-empty line, capitalized', () => {
    expect(commitMessageFromPrompt('make the cube spin')).toBe('Make the cube spin');
  });

  it('takes the first line of a multi-line prompt', () => {
    expect(commitMessageFromPrompt('\n\nadd a floor plane\nand a light')).toBe('Add a floor plane');
  });

  it('truncates very long prompts', () => {
    const msg = commitMessageFromPrompt('x'.repeat(200));
    expect(msg.length).toBeLessThanOrEqual(72);
    expect(msg.endsWith('…')).toBe(true);
  });

  it('falls back for an empty/whitespace prompt', () => {
    expect(commitMessageFromPrompt('   \n  ')).toBe('Checkpoint: save changes from this turn');
  });
});

describe('commitTurnWork', () => {
  const handle = { projectId: 'p1', containerId: 'c1' } as SandboxHandle;

  it('stages all changes, commits only when staged, with the message via env', async () => {
    const exec = vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
    const sandbox = { exec } as unknown as Sandbox;

    await commitTurnWork(sandbox, handle, 'Add a rotating cube');

    expect(exec).toHaveBeenCalledTimes(1);
    const cmd = String(exec.mock.calls[0]?.[1] ?? '');
    expect(cmd).toContain('git add -A');
    // Conditional commit: only commit when there ARE staged changes.
    expect(cmd).toContain('git diff --cached --quiet || git commit');
    // Message passed via env (injection-safe), not interpolated into the command.
    expect(cmd).toContain('"$CM"');
    const opts = exec.mock.calls[0]?.[2] as { env?: Record<string, string> } | undefined;
    expect(opts?.env?.CM).toBe('Add a rotating cube');
  });
});
