// Idle-sandbox sweep (project_plan.md §6): every 60s, stop sandboxes with no
// exec/spawn activity for 30 min. stop() snapshots the project to MinIO first
// (when MINIO_* is configured). Bun-only — wired from index.ts, never the Node
// test path.

import { and, eq, isNull } from 'drizzle-orm';

import { sessions } from '@praxis/db';
import { db } from '@praxis/db/client';
import { IdleSweeper } from '@praxis/sandbox';

import { logger } from './logger';
import { removePreview } from './preview';
import { deleteRoom, getRoomByProject, getSandbox } from './runtime';

/** Teardown that must happen whenever a project's sandbox goes away, on EVERY
 *  path (idle sweep here; the last-socket path does the equivalent in ws.ts).
 *  Clears the preview registry entry (so a reused IP can't be served — STORY-51),
 *  closes the shared agent + drops the in-memory room, and marks the project's
 *  open session(s) ended in the DB. The project VOLUME is never touched — files
 *  persist for the next open. Best-effort: a failure is logged, never thrown. */
export async function cleanupStoppedProject(projectId: string): Promise<void> {
  removePreview(projectId);
  const room = getRoomByProject(projectId);
  if (room) {
    room.unwatchFiles?.();
    try {
      await room.agent?.close();
    } catch {
      /* agent already gone */
    }
    deleteRoom(room.sessionId);
  }
  try {
    await db
      .update(sessions)
      .set({ endedAt: new Date() })
      .where(and(eq(sessions.projectId, projectId), isNull(sessions.endedAt)));
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'sandbox.idle_cleanup_db_failed',
    );
  }
  logger.info({ projectId }, 'sandbox.idle_stopped');
}

/** Reconcile DB state with reality at boot. The in-memory rooms map is empty on a
 *  fresh process, so any session row still marked open is stale (its WS room died
 *  with the previous process). Mark them ended so the DB reflects reality and the
 *  preview/registry stays consistent. Running orphan containers are left in place:
 *  the next open reuses them (fast resume) and the idle sweep reaps them via the
 *  container-start-time fallback. Volumes are never removed. */
export async function reconcileSessionsOnBoot(): Promise<void> {
  try {
    const ended = await db
      .update(sessions)
      .set({ endedAt: new Date() })
      .where(isNull(sessions.endedAt))
      .returning({ id: sessions.id });
    logger.info({ count: ended.length }, 'sessions.reconciled_on_boot');
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'sessions.reconcile_on_boot_failed',
    );
  }
}

/** Start the idle sweep. Returns a stop function. Resilient: Docker/MinIO
 *  errors are logged, never fatal. Shares the process-wide DockerSandbox with
 *  the session runtime so persistence config is identical. */
export function startIdleSweep(): () => void {
  const sandbox = getSandbox();
  const sweeper = new IdleSweeper(sandbox, {
    onStop: (projectId) => cleanupStoppedProject(projectId),
  });
  logger.info('sandbox.idle_sweep_start');
  return sweeper.start(60_000, (err) =>
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'sandbox.sweep_failed'),
  );
}
