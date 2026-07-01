import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ExecResult,
  FileEvent,
  ProcessHandle,
  Sandbox,
  SandboxHandle,
  Unsubscribe,
} from './index';

describe('@praxis/sandbox interface', () => {
  it('is implementable with no `any` and exports its types', () => {
    // A no-op implementation proves the interface is concrete and exported.
    const noop: Sandbox = {
      start: async (projectId): Promise<SandboxHandle> => ({
        projectId,
        containerId: 'c',
      }),
      exec: async (): Promise<ExecResult> => ({ exitCode: 0, stdout: '', stderr: '' }),
      spawn: async (): Promise<ProcessHandle> => ({
        pid: 1,
        stdout: (async function* () {})(),
        stderr: (async function* () {})(),
        write: async () => {},
        kill: async () => {},
        wait: async () => 0,
      }),
      writeFile: async () => {},
      readFile: async () => '',
      watchFiles: (): Unsubscribe => () => {},
      exposePort: async () => 'https://preview.example',
      stop: async () => {},
      destroy: async () => {},
      clone: async () => true,
    };

    expect(typeof noop.start).toBe('function');
    expectTypeOf<Sandbox['exposePort']>().returns.resolves.toBeString();
    expectTypeOf<FileEvent['type']>().toEqualTypeOf<'create' | 'modify' | 'delete'>();
  });
});
