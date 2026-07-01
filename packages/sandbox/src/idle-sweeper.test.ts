import { describe, expect, it, vi } from 'vitest';

import type { DockerSandbox } from './docker-sandbox.js';
import { IdleSweeper } from './idle-sweeper.js';
import type { SandboxHandle } from './index.js';

// A minimal fake exercising only what IdleSweeper touches, so the sweep logic
// is tested without Docker (the real Docker path is covered in the gated
// integration test).
function fakeSandbox(idle: SandboxHandle[]) {
  const stopped: string[] = [];
  const sandbox = {
    listIdle: vi.fn(async () => idle),
    stop: vi.fn(async (h: SandboxHandle) => {
      stopped.push(h.projectId);
    }),
  } as unknown as DockerSandbox;
  return { sandbox, stopped };
}

describe('IdleSweeper', () => {
  it('stops every idle sandbox and reports the projectIds', async () => {
    const { sandbox, stopped } = fakeSandbox([
      { projectId: 'a', containerId: 'ca' },
      { projectId: 'b', containerId: 'cb' },
    ]);
    const onStop = vi.fn();
    const result = await new IdleSweeper(sandbox, { onStop }).sweep();
    expect(result).toEqual(['a', 'b']);
    expect(stopped).toEqual(['a', 'b']);
    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it('continues past a stop() failure', async () => {
    const sandbox = {
      listIdle: vi.fn(async () => [
        { projectId: 'a', containerId: 'ca' },
        { projectId: 'b', containerId: 'cb' },
      ]),
      stop: vi.fn(async (h: SandboxHandle) => {
        if (h.projectId === 'a') throw new Error('boom');
      }),
    } as unknown as DockerSandbox;
    const result = await new IdleSweeper(sandbox).sweep();
    expect(result).toEqual(['b']);
  });

  it('passes its idle threshold and clock through to listIdle', async () => {
    const { sandbox } = fakeSandbox([]);
    await new IdleSweeper(sandbox, { idleMs: 1234 }).sweep(5000);
    expect(sandbox.listIdle).toHaveBeenCalledWith(1234, 5000);
  });

  it('awaits an async onStop before the sweep resolves (teardown completes)', async () => {
    const { sandbox } = fakeSandbox([{ projectId: 'a', containerId: 'ca' }]);
    let done = false;
    const onStop = vi.fn(async () => {
      await Promise.resolve();
      done = true; // only set after the microtask — proves the sweep awaited it
    });
    await new IdleSweeper(sandbox, { onStop }).sweep();
    expect(done).toBe(true);
  });
});
