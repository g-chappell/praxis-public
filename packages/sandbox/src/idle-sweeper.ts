// IdleSweeper — stops sandboxes with no exec/spawn activity for `idleMs`
// (30 min per project_plan.md §6). The orchestrator runs sweep() on a 60s
// interval; stop() snapshots the project to the object store on the way down.

import type { DockerSandbox } from './docker-sandbox.js';

export interface IdleSweeperOptions {
  /** Idle threshold in ms. Default 30 minutes. */
  idleMs?: number;
  /** Called (and awaited) after a sandbox is stopped by the sweep, so consumers
   *  can do async teardown — clear the preview registry, mark the session ended. */
  onStop?: (projectId: string) => void | Promise<void>;
}

export class IdleSweeper {
  private readonly idleMs: number;
  private readonly onStop?: (projectId: string) => void | Promise<void>;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly sandbox: DockerSandbox,
    options: IdleSweeperOptions = {},
  ) {
    this.idleMs = options.idleMs ?? 30 * 60 * 1000;
    this.onStop = options.onStop;
  }

  /** Stop every sandbox idle beyond the threshold. Returns stopped projectIds. */
  async sweep(now: number = Date.now()): Promise<string[]> {
    const idle = await this.sandbox.listIdle(this.idleMs, now);
    const stopped: string[] = [];
    for (const handle of idle) {
      try {
        await this.sandbox.stop(handle);
        stopped.push(handle.projectId);
        await this.onStop?.(handle.projectId);
      } catch {
        // Leave it for the next sweep rather than aborting the whole pass.
      }
    }
    return stopped;
  }

  /** Run sweep() every `intervalMs` (default 60s). Returns a stop function.
   *  A failing pass (e.g. Docker unreachable) is swallowed so the interval
   *  survives to the next tick. */
  start(intervalMs = 60_000, onError?: (err: unknown) => void): () => void {
    this.timer = setInterval(() => {
      this.sweep().catch((err) => onError?.(err));
    }, intervalMs);
    this.timer.unref?.();
    return () => {
      if (this.timer) clearInterval(this.timer);
    };
  }
}
