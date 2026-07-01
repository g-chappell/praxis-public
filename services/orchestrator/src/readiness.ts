// Workspace readiness probe (STORY-51). The dev server is spawned fire-and-forget
// (npm install can take ~a minute, during which the preview 502s). The web client
// holds a loading screen until the workspace is actually serveable; this polls the
// dev server and broadcasts `workspace_ready` once it answers, so the preview is
// never a 502 on entry. Node-safe (fetch only) — no Bun/docker globals.

import { logger } from './logger';
import { resolvePreviewTarget } from './preview';
import { broadcastToRoom, getRoom, type SessionRoom } from './runtime';

const PROBE_INTERVAL_MS = 1_000;
// Cold `npm install` + first Vite build can be slow; give it room. On timeout we
// let the client in anyway (the preview pane shows its own "starting…") rather
// than spin forever.
const PROBE_TIMEOUT_MS = 180_000;

/** Flip the room to ready and tell its current clients. Idempotent. */
function markReady(room: SessionRoom): void {
  if (room.previewReady) return;
  room.previewReady = true;
  broadcastToRoom(room, { type: 'workspace_ready', previewReady: true });
}

/** One readiness check: the dev server answers (any non-5xx) on its preview port. */
async function probeOnce(projectId: string): Promise<boolean> {
  const target = await resolvePreviewTarget(projectId);
  if (!target) return false;
  try {
    const res = await fetch(`http://${target.ip}:${target.port}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(2_000),
    });
    return res.status < 500; // up and serving (Vite returns 200; ignore 4xx)
  } catch {
    return false; // connection refused while still booting
  }
}

/** Poll the project's dev server until it answers, then mark the room ready and
 *  broadcast `workspace_ready`. When `hasDevServer` is false there's nothing to
 *  wait for — mark ready at once. Fire-and-forget; self-cancels if the room is
 *  torn down mid-probe. */
export function startReadinessProbe(room: SessionRoom, hasDevServer: boolean): void {
  if (!hasDevServer) {
    markReady(room);
    return;
  }
  const sessionId = room.sessionId;
  const deadline = Date.now() + PROBE_TIMEOUT_MS;
  void (async () => {
    while (Date.now() < deadline) {
      if (!getRoom(sessionId)) return; // room torn down → stop probing
      if (await probeOnce(room.projectId)) {
        markReady(room);
        return;
      }
      await new Promise((r) => setTimeout(r, PROBE_INTERVAL_MS));
    }
    logger.warn({ sessionId, projectId: room.projectId }, 'preview.readiness_timeout');
    markReady(room); // don't strand the client on the loader
  })();
}
